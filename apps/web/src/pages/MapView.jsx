import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import AppShell from '../components/layout/AppShell.jsx';
import { Map, MARKER_COLORS } from '../components/Map.jsx';
import TrailerStatusBadge from '../components/TrailerStatusBadge.jsx';
import {
  fetchTrailerLocations,
  fetchActiveLoadsByTrailer,
  formatRelativeTime,
  TRAILER_STATUS_FILTERS,
} from '../lib/trailers.js';
import { fetchTruckLocations, fetchActiveLoadsByTruck } from '../lib/trucks.js';

const DEFAULT_CENTER = [-84.388, 33.749]; // Atlanta, GA

const UNIT_TYPE_LABELS = { trailer: 'Trailer', truck: 'Truck' };

export default function MapView() {
  const [units, setUnits] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchTrailerLocations(supabase),
      fetchActiveLoadsByTrailer(supabase),
      fetchTruckLocations(supabase),
      fetchActiveLoadsByTruck(supabase),
    ])
      .then(([trailerLocations, activeLoadByTrailerId, truckLocations, driverByTruckId]) => {
        if (cancelled) return;

        const trailerUnits = trailerLocations.map((trailer) => ({
          id: trailer.id,
          unitType: 'trailer',
          number: trailer.trailer_number,
          status: trailer.status,
          lat: trailer.current_lat,
          lng: trailer.current_lng,
          last_ping_at: trailer.last_ping_at,
          driverName: activeLoadByTrailerId.get(trailer.id)?.driverName ?? null,
        }));

        // A truck's derived status is just in_use/available -- no
        // At-Plant/In-Transit/At-Customer breakdown like trailers get, so
        // presence of an active load is all that's needed here.
        const truckUnits = truckLocations.map((truck) => ({
          id: truck.id,
          unitType: 'truck',
          number: truck.unit_number,
          status: driverByTruckId.has(truck.id) ? 'in_use' : 'available',
          lat: truck.current_lat,
          lng: truck.current_lng,
          last_ping_at: truck.last_ping_at,
          driverName: driverByTruckId.get(truck.id) ?? null,
        }));

        setUnits([...trailerUnits, ...truckUnits]);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markers = (units ?? []).map((unit) => ({
    id: unit.id,
    unitType: unit.unitType,
    lat: unit.lat,
    lng: unit.lng,
    label: `${UNIT_TYPE_LABELS[unit.unitType]} ${unit.number}`,
    status: unit.status,
    driverName: unit.driverName,
  }));

  const filteredUnits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (units ?? []).filter((unit) => {
      const matchesStatus = statusFilter === 'all' || unit.status === statusFilter;
      const matchesSearch =
        !query || unit.number.toLowerCase().includes(query) || unit.driverName?.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [units, search, statusFilter]);

  function handleSelectUnit(unit) {
    mapRef.current?.flyTo([unit.lng, unit.lat]);
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-primary">Live Map</h1>
      <p className="mt-1 text-sm text-text/70">Trailer and truck locations across the fleet.</p>

      {error && (
        <p className="mt-4 rounded border border-status-dropped/30 bg-status-dropped/5 p-3 text-sm text-status-dropped">
          Couldn&apos;t load unit locations: {error}
        </p>
      )}

      {!error && (
        <div className="mt-6 flex h-[600px] gap-4">
          <div className="flex-1 overflow-hidden rounded border border-border">
            <Map
              ref={mapRef}
              markers={markers}
              center={markers[0] ? [markers[0].lng, markers[0].lat] : DEFAULT_CENTER}
              zoom={markers.length ? 6 : 4}
              className="h-full w-full"
            />
          </div>

          <aside className="flex w-80 shrink-0 flex-col rounded border border-border bg-white">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text/60">
                Active Units
                {units !== null && <span className="ml-1 normal-case text-text/40">· {units.length}</span>}
              </h2>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search trailer #, truck #, or driver…"
                className="mt-3 w-full rounded border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
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

            <div className="flex-1 overflow-y-auto">
              {units !== null && filteredUnits.length === 0 && (
                <p className="p-4 text-sm text-text/60">No matching units.</p>
              )}
              {filteredUnits.map((unit) => (
                <button
                  key={`${unit.unitType}-${unit.id}`}
                  type="button"
                  onClick={() => handleSelectUnit(unit)}
                  className="flex w-full items-center justify-between border-b border-border p-3 text-left text-sm last:border-0 hover:bg-surface"
                >
                  <div>
                    <p className="flex items-center gap-1.5 font-mono font-medium text-text">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: MARKER_COLORS[unit.status] ?? '#64748b' }}
                        aria-hidden="true"
                      />
                      {UNIT_TYPE_LABELS[unit.unitType]} {unit.number}
                    </p>
                    <p className="mt-0.5 text-xs text-text/50">
                      {unit.driverName && <>{unit.driverName} · </>}
                      {formatRelativeTime(unit.last_ping_at)}
                    </p>
                  </div>
                  <TrailerStatusBadge status={unit.status} />
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {!error && units !== null && markers.length === 0 && (
        <p className="mt-3 text-sm text-text/60">No located units yet.</p>
      )}
    </AppShell>
  );
}
