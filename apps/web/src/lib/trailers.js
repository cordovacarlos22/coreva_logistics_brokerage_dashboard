export const TRAILER_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In Use' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'maintenance', label: 'Maintenance' },
];

export async function fetchTrailerLocations(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('trailers')
    .select('id, trailer_number, status, current_lat, current_lng, last_ping_at')
    .not('current_lat', 'is', null)
    .not('current_lng', 'is', null);

  if (error) throw new Error(`trailers: ${error.message}`);
  return data;
}

// All trailers, pinged or not -- unlike fetchTrailerLocations, which only
// returns geo-located ones for the map, the tracker needs the full fleet.
export async function fetchTrailers(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('trailers')
    .select('id, trailer_number, type, status, last_ping_at')
    .order('trailer_number', { ascending: true });

  if (error) throw new Error(`trailers: ${error.message}`);
  return data;
}

export async function createTrailer(supabaseClient, { trailerNumber, type, status }) {
  const { data, error } = await supabaseClient
    .from('trailers')
    .insert({ trailer_number: trailerNumber, type: type || null, status })
    .select('id, trailer_number, type, status, last_ping_at')
    .single();

  if (error) throw new Error(`trailers: ${error.message}`);
  return data;
}

// A trailer has no driver column of its own -- "who's driving it" is whoever
// has the trailer's currently active (not yet delivered/dropped) load. Maps
// trailer_id -> { status, driverName } for every such load, so callers get
// both who's driving it and what that load's status is (e.g. to derive a
// human-friendly "location").
export async function fetchActiveLoadsByTrailer(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('loads')
    .select('trailer_id, status, driver:profiles!driver_id(full_name)')
    .not('trailer_id', 'is', null)
    .not('status', 'in', '(delivered,dropped)');

  if (error) throw new Error(`loads: ${error.message}`);

  const activeLoadByTrailerId = new Map();
  for (const load of data) {
    activeLoadByTrailerId.set(load.trailer_id, { status: load.status, driverName: load.driver?.full_name ?? null });
  }
  return activeLoadByTrailerId;
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const diffMinutes = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

const IDLE_LOCATION_LABELS = {
  available: 'At Yard',
  dropped: 'Dropped at Yard',
  maintenance: 'Maintenance',
};

const ACTIVE_LOAD_LOCATION_LABELS = {
  pending: 'At Plant',
  assigned: 'At Plant',
  picked_up: 'At Plant',
  in_transit: 'In Transit',
  delivered: 'At Customer',
};

// A trailer's own status tells you the yard-side state (available, dropped,
// in maintenance). Once it's `in_use`, "where it actually is" comes from its
// active load's status instead -- there's no single column for that, so this
// combines both rather than exposing the raw enum value to the UI.
export function deriveTrailerLocation(trailer, activeLoad) {
  if (activeLoad) return ACTIVE_LOAD_LOCATION_LABELS[activeLoad.status] ?? 'In Transit';
  return IDLE_LOCATION_LABELS[trailer.status] ?? 'In Transit';
}

export function computeTrailerLocationCounts(trailers, activeLoadByTrailerId) {
  const counts = { 'At Plant': 0, 'In Transit': 0, 'At Customer': 0, 'Dropped at Yard': 0 };
  for (const trailer of trailers) {
    const location = deriveTrailerLocation(trailer, activeLoadByTrailerId.get(trailer.id));
    if (location in counts) counts[location] += 1;
  }
  return counts;
}
