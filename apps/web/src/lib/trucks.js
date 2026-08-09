export async function fetchTruckLocations(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('trucks')
    .select('id, unit_number, current_lat, current_lng, last_ping_at')
    .not('current_lat', 'is', null)
    .not('current_lng', 'is', null);

  if (error) throw new Error(`trucks: ${error.message}`);
  return data;
}

// A truck has no driver column of its own, same as trailers -- "who's
// driving it" is whoever has the truck's currently active (not yet
// delivered/dropped) load. Unlike trailers, a truck's derived status only
// ever needs to be in_use/available (no At-Plant/In-Transit/At-Customer
// breakdown), so the load's own status isn't needed here -- just whether
// one exists.
export async function fetchActiveLoadsByTruck(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('loads')
    .select('truck_id, driver:profiles(full_name)')
    .not('truck_id', 'is', null)
    .not('status', 'in', '(delivered,dropped)');

  if (error) throw new Error(`loads: ${error.message}`);

  const driverByTruckId = new Map();
  for (const load of data) {
    driverByTruckId.set(load.truck_id, load.driver?.full_name ?? null);
  }
  return driverByTruckId;
}
