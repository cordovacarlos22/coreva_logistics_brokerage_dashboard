import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from 'boneyard-js/react';
import { ThinkingOrb } from 'thinking-orbs';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { fetchLoads, computeKpis } from '../lib/loads.js';

export default function LoadsOverview() {
  const { profile } = useAuth();
  const [loads, setLoads] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const isStaff = profile?.role === 'admin' || profile?.role === 'dispatcher';

  useEffect(() => {
    let cancelled = false;
    fetchLoads(supabase)
      .then((data) => {
        if (!cancelled) setLoads(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = loads ? computeKpis(loads, { isStaff }) : [];
  const columnCount = isStaff ? 8 : 6;

  const filteredLoads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return loads ?? [];
    return (loads ?? []).filter((load) =>
      [load.load_number, load.origin_address, load.destination_address, load.consignee?.name].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [loads, search]);

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-primary">Loads Overview</h1>
      <p className="mt-1 text-sm text-text/70">
        {isStaff
          ? 'Real-time status of active shipments.'
          : `Displaying restricted view for ${profile?.customer_company}.`}
      </p>

      {error && (
        <p className="mt-4 rounded border border-status-dropped/30 bg-status-dropped/5 p-3 text-sm text-status-dropped">
          Couldn&apos;t load shipments: {error}
        </p>
      )}

      {!error && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded border border-border bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text/60">{kpi.label}</p>
              <p className="mt-2 text-3xl font-bold text-primary">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {!error && loads !== null && loads.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by load #, origin, destination, or customer…"
          className="mt-6 w-full max-w-sm rounded border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
        />
      )}

      <Skeleton
        loading={loads === null && !error}
        name="loads-overview-table"
        fallback={
          <div className="mt-6 flex items-center justify-center gap-2 rounded border border-border bg-white p-6 text-sm text-text/60">
            <ThinkingOrb size={20} />
            Loading…
          </div>
        }
      >
        <div className="mt-6 overflow-x-auto rounded border border-border bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text/60">
              <tr>
                <th className="px-4 py-3">Load #</th>
                <th className="px-4 py-3">Status</th>
                {isStaff && <th className="px-4 py-3">Driver</th>}
                {isStaff && <th className="px-4 py-3">Trailer #</th>}
                <th className="px-4 py-3">Origin</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {loads?.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-6 text-center text-text/60">
                    No loads yet.
                  </td>
                </tr>
              )}
              {loads !== null && loads.length > 0 && filteredLoads.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-6 text-center text-text/60">
                    No matching loads.
                  </td>
                </tr>
              )}
              {filteredLoads.map((load) => (
                <tr key={load.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 font-mono">
                    <Link to={`/loads/${load.id}`} className="text-primary hover:underline">
                      {load.load_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={load.status} />
                  </td>
                  {isStaff && <td className="px-4 py-3">{load.driver?.full_name ?? '—'}</td>}
                  {isStaff && (
                    <td className="px-4 py-3 font-mono">{load.trailer?.trailer_number ?? '—'}</td>
                  )}
                  <td className="px-4 py-3">{load.origin_address ?? '—'}</td>
                  <td className="px-4 py-3">{load.destination_address ?? '—'}</td>
                  <td className="px-4 py-3">{load.consignee?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {load.updated_at ? new Date(load.updated_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Skeleton>
    </AppShell>
  );
}
