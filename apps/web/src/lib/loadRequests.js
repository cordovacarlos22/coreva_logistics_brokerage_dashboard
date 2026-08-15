export async function fetchPendingLoadRequests(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('load_requests')
    .select('id, wants_load_today, has_empty, created_at, driver:profiles!driver_id(full_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function resolveLoadRequest(supabaseClient, id, status, resolverId) {
  const { error } = await supabaseClient
    .from('load_requests')
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: resolverId })
    .eq('id', id);

  if (error) throw error;
}
