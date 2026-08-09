export async function fetchTeamMessages(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('team_messages')
    .select('*, author:profiles(full_name)')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`team_messages: ${error.message}`);
  return data;
}

export async function sendTeamMessage(supabaseClient, { authorId, body }) {
  const { error } = await supabaseClient.from('team_messages').insert({ author_id: authorId, body });
  if (error) throw new Error(`team_messages insert: ${error.message}`);
}

export async function fetchLoadMessages(supabaseClient, loadId, channel) {
  const { data, error } = await supabaseClient
    .from('load_messages')
    .select('*, sender:profiles(full_name)')
    .eq('load_id', loadId)
    .eq('channel', channel)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`load_messages: ${error.message}`);
  return data;
}

export async function sendLoadMessage(supabaseClient, { loadId, channel, senderId, body }) {
  const { error } = await supabaseClient
    .from('load_messages')
    .insert({ load_id: loadId, channel, sender_id: senderId, body });
  if (error) throw new Error(`load_messages insert: ${error.message}`);
}

// Generic "notify me when a new row lands" helper shared by both chat
// surfaces. Realtime payloads don't include joined columns, so callers
// re-fetch the full (joined) list on each insert rather than trying to
// merge partial rows -- message volume here is low enough that this is
// simpler and more robust than manual cache patching.
export function subscribeToInserts(supabaseClient, { table, filter, onInsert }) {
  if (!supabaseClient) return () => {};

  const channelName = `${table}-${filter ?? 'all'}-${Math.random().toString(36).slice(2)}`;
  const channel = supabaseClient
    .channel(channelName)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onInsert)
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
}
