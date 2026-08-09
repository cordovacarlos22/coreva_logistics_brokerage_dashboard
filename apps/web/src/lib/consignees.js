// A load's consignee is scoped to that load's own customer_company (e.g.
// International Paper's list), not necessarily the logged-in user's --
// callers pass the specific customer_company the list should reflect.
export async function fetchConsignees(supabaseClient, customerCompany) {
  const { data, error } = await supabaseClient
    .from('consignees')
    .select('id, name')
    .eq('customer_company', customerCompany)
    .order('name', { ascending: true });

  if (error) throw new Error(`consignees: ${error.message}`);
  return data;
}

export async function createConsignee(supabaseClient, { name, customerCompany }) {
  const { data, error } = await supabaseClient
    .from('consignees')
    .insert({ name, customer_company: customerCompany })
    .select('id, name')
    .single();

  if (error) throw new Error(`consignees: ${error.message}`);
  return data;
}
