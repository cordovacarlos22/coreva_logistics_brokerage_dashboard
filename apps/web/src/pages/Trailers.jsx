import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Skeleton } from 'boneyard-js/react';
import { ThinkingOrb } from 'thinking-orbs';
import { sileo } from 'sileo';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import TrailerStatusBadge from '../components/TrailerStatusBadge.jsx';
import {
  fetchTrailers,
  fetchActiveLoadsByTrailer,
  createTrailer,
  deriveTrailerLocation,
  computeTrailerLocationCounts,
  formatRelativeTime,
  TRAILER_STATUS_FILTERS,
} from '../lib/trailers.js';

const LOCATION_KPIS = [
  { key: 'At Plant', label: 'At Plant', icon: 'factory' },
  { key: 'At Customer', label: 'At Customer', icon: 'storefront' },
  { key: 'Dropped at Yard', label: 'Dropped at Yard', icon: 'warehouse' },
  { key: 'In Transit', label: 'In Transit', icon: 'local_shipping' },
];

const STATUS_OPTIONS = TRAILER_STATUS_FILTERS.filter((option) => option.value !== 'all');

export default function Trailers() {
  const { profile } = useAuth();
  const isStaff = profile?.role === 'admin' || profile?.role === 'dispatcher';

  const [trailers, setTrailers] = useState(null);
  const [activeLoadByTrailerId, setActiveLoadByTrailerId] = useState(new Map());
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { trailerNumber: '', type: '', status: 'available' } });

  useEffect(() => {
    if (!isStaff) return undefined;
    let cancelled = false;
    Promise.all([fetchTrailers(supabase), fetchActiveLoadsByTrailer(supabase)])
      .then(([trailerRows, activeLoads]) => {
        if (cancelled) return;
        setTrailers(trailerRows);
        setActiveLoadByTrailerId(activeLoads);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  const rows = useMemo(() => {
    return (trailers ?? []).map((trailer) => {
      const activeLoad = activeLoadByTrailerId.get(trailer.id);
      return {
        ...trailer,
        driverName: activeLoad?.driverName ?? null,
        location: deriveTrailerLocation(trailer, activeLoad),
      };
    });
  }, [trailers, activeLoadByTrailerId]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchesSearch =
        !query || row.trailer_number.toLowerCase().includes(query) || row.driverName?.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);

  const locationCounts = computeTrailerLocationCounts(trailers ?? [], activeLoadByTrailerId);

  async function onAddTrailer({ trailerNumber, type, status }) {
    setAddError(null);
    try {
      const trailer = await createTrailer(supabase, {
        trailerNumber: trailerNumber.trim(),
        type: type.trim(),
        status,
      });
      setTrailers((prev) => [...(prev ?? []), trailer]);
      reset();
      setShowAddForm(false);
      sileo.success({ title: 'Trailer added' });
    } catch (err) {
      setAddError(err.message);
    }
  }

  if (!isStaff) {
    return (
      <AppShell>
        <p className="text-sm text-text/60">Trailer Tracker is only available to dispatch and admin staff.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Trailer Tracker</h1>
          <p className="mt-1 text-sm text-text/70">Real-time yard and transit monitoring.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search trailer # or driver…"
            className="w-64 rounded border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            {showAddForm ? 'Cancel' : 'Add Trailer'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleSubmit(onAddTrailer)}
          noValidate
          className="mt-4 flex flex-wrap items-end gap-3 rounded border border-border bg-white p-4"
        >
          <div>
            <label className="block text-xs font-medium text-text/70" htmlFor="trailerNumber">
              Trailer Number
            </label>
            <input
              id="trailerNumber"
              aria-invalid={errors.trailerNumber ? 'true' : 'false'}
              {...register('trailerNumber', { required: 'Required' })}
              className="mt-1 rounded border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            />
            {errors.trailerNumber && <p className="mt-1 text-xs text-status-dropped">{errors.trailerNumber.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-text/70" htmlFor="type">
              Type
            </label>
            <input
              id="type"
              placeholder="53' Dry Van"
              {...register('type')}
              className="mt-1 rounded border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text/70" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              {...register('status')}
              className="mt-1 rounded border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>

          {addError && <p className="w-full text-sm text-status-dropped">{addError}</p>}
        </form>
      )}

      {error && (
        <p className="mt-4 rounded border border-status-dropped/30 bg-status-dropped/5 p-3 text-sm text-status-dropped">
          Couldn&apos;t load trailers: {error}
        </p>
      )}

      {!error && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {LOCATION_KPIS.map((kpi) => (
            <div key={kpi.key} className="rounded border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-text/60">{kpi.label}</p>
                <span className="material-symbols-outlined text-text/40">{kpi.icon}</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-primary">{locationCounts[kpi.key]}</p>
            </div>
          ))}
        </div>
      )}

      {!error && (
        <Skeleton
          loading={trailers === null}
          name="trailers-table"
          fallback={
            <div className="mt-6 flex items-center justify-center gap-2 rounded border border-border bg-white p-6 text-sm text-text/60">
              <ThinkingOrb size={20} />
              Loading…
            </div>
          }
        >
          <div className="mt-6 rounded border border-border bg-white">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text/60">Active Trailers</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {TRAILER_STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={`rounded-badge px-2.5 py-1 text-xs font-medium ${
                      statusFilter === filter.value ? 'bg-primary text-white' : 'border border-border text-text/70'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-text/60">
                  <tr>
                    <th className="px-4 py-3">Trailer #</th>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Last GPS Ping</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trailers?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-text/60">
                        No trailers yet.
                      </td>
                    </tr>
                  )}
                  {trailers !== null && trailers.length > 0 && filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-text/60">
                        No matching trailers.
                      </td>
                    </tr>
                  )}
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 font-mono">{row.trailer_number}</td>
                      <td className="px-4 py-3">{row.driverName ?? '—'}</td>
                      <td className="px-4 py-3">{row.location}</td>
                      <td className="px-4 py-3 text-xs">{formatRelativeTime(row.last_ping_at)}</td>
                      <td className="px-4 py-3">
                        <TrailerStatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Skeleton>
      )}
    </AppShell>
  );
}
