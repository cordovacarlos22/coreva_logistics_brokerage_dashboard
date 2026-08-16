// Backed by the driver_locations view (supabase/schema.sql) -- a driver's
// own latest ping, independent of whether their load has a truck/trailer
// assigned yet. See that view's comment for why this exists separately
// from fetchTruckLocations/fetchTrailerLocations.
export async function fetchDriverLocations(supabaseClient) {
  const { data, error } = await supabaseClient.from('driver_locations').select('*');
  if (error) throw new Error(`driver_locations: ${error.message}`);
  return data;
}
