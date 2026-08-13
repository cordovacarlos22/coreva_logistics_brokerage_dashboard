export async function fetchLoads(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('loads')
    .select(
      `id, load_number, status, customer_company, origin_address, destination_address,
       created_at, updated_at, delivery_appointment_at, bol_verification_status,
       driver:profiles!driver_id(full_name),
       trailer:trailers(trailer_number),
       consignee:consignees(id, name)`
    )
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

function isToday(isoString) {
  if (!isoString) return false;
  return isoString.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function computeKpis(loads, { isStaff }) {
  if (isStaff) {
    return [
      { label: 'Loads In Transit', value: loads.filter((l) => l.status === 'in_transit').length },
      {
        label: 'Delivered Today',
        value: loads.filter((l) => l.status === 'delivered' && isToday(l.updated_at)).length,
      },
      { label: 'Dropped Trailers', value: loads.filter((l) => l.status === 'dropped').length },
    ];
  }

  return [
    {
      label: 'My Active Loads',
      value: loads.filter((l) => !['delivered', 'dropped'].includes(l.status)).length,
    },
    {
      label: 'My Deliveries Today',
      value: loads.filter((l) => l.status === 'delivered' && isToday(l.updated_at)).length,
    },
  ];
}
