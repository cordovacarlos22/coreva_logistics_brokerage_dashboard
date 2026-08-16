// Driver picker for the Driver Messages inbox -- `lib/drivers.js` is
// unrelated (it's GPS location data), so this is a separate, simple query.
export async function fetchDrivers(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'driver')
    .order('full_name', { ascending: true });
  if (error) throw new Error(`profiles: ${error.message}`);
  return data;
}
