function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchLoadDetail(supabaseClient, loadId) {
  const [load, stops, checklists, discrepancies, notes] = await Promise.all([
    supabaseClient
      .from('loads')
      .select(
        `*, driver:profiles(full_name), trailer:trailers(trailer_number, type), truck:trucks(unit_number),
         consignee:consignees(id, name)`
      )
      .eq('id', loadId)
      .single()
      .then(unwrap('load')),
    supabaseClient
      .from('load_stops')
      .select('*')
      .eq('load_id', loadId)
      .order('sequence', { ascending: true })
      .then(unwrap('load_stops')),
    supabaseClient
      .from('checklists')
      .select('*, driver:profiles(full_name)')
      .eq('load_id', loadId)
      .order('created_at', { ascending: true })
      .then(unwrap('checklists')),
    supabaseClient
      .from('discrepancy_reports')
      .select('*')
      .eq('load_id', loadId)
      .order('reported_at', { ascending: false })
      .then(unwrap('discrepancy_reports')),
    supabaseClient
      .from('load_notes')
      .select('*, author:profiles(full_name)')
      .eq('load_id', loadId)
      .order('created_at', { ascending: true })
      .then(unwrap('load_notes')),
  ]);

  return { load, stops, checklists, discrepancies, notes };
}

export async function addLoadNote(supabaseClient, { loadId, authorId, body }) {
  const { data, error } = await supabaseClient
    .from('load_notes')
    .insert({ load_id: loadId, author_id: authorId, body })
    .select('*, author:profiles(full_name)')
    .single();

  if (error) throw new Error(`load_notes insert: ${error.message}`);
  return data;
}

export async function updateLoadConsignee(supabaseClient, { loadId, consigneeId }) {
  const { data, error } = await supabaseClient
    .from('loads')
    .update({ consignee_id: consigneeId })
    .eq('id', loadId)
    .select('consignee:consignees(id, name)')
    .single();

  if (error) throw new Error(`loads update: ${error.message}`);
  return data.consignee;
}
