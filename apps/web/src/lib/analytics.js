const STATUS_ORDER = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'dropped'];

const RANGE_WINDOW_MS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

// Rolling look-back window (not calendar-aligned, so it's never empty right
// after midnight) anchored to `now`. A load counts if it was either
// dispatched or last touched (e.g. delivered) inside the window, so the
// filtered set stays coherent across every derived chart on the page.
export function filterLoadsByRange(loads, range, { now = new Date() } = {}) {
  if (range === 'all') return loads;

  const windowMs = RANGE_WINDOW_MS[range];
  const cutoff = now.getTime() - windowMs;
  return loads.filter((load) => {
    const createdAt = load.created_at ? new Date(load.created_at).getTime() : null;
    const updatedAt = load.updated_at ? new Date(load.updated_at).getTime() : null;
    return (createdAt !== null && createdAt >= cutoff) || (updatedAt !== null && updatedAt >= cutoff);
  });
}

export function computeStatusCounts(loads) {
  const counts = new Map();
  for (const load of loads) {
    counts.set(load.status, (counts.get(load.status) ?? 0) + 1);
  }
  return STATUS_ORDER.filter((status) => counts.has(status)).map((status) => ({
    status,
    count: counts.get(status),
  }));
}

function startOfWeek(value) {
  const date = new Date(value);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function weekKey(value) {
  return startOfWeek(value).toISOString().slice(0, 10);
}

// Buckets loads into the last `weeks` calendar weeks (Mon-Sun), counting
// dispatches by created_at and deliveries by updated_at where status is
// 'delivered' -- lets the chart show dispatched vs. delivered volume trending
// side by side without a second Supabase query.
export function computeWeeklyVolume(loads, { weeks = 8, now = new Date() } = {}) {
  const currentWeekStart = startOfWeek(now);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
    buckets.push({
      key: weekStart.toISOString().slice(0, 10),
      label: weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      dispatched: 0,
      delivered: 0,
    });
  }

  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const load of loads) {
    if (load.created_at) {
      const dispatchBucket = bucketByKey.get(weekKey(load.created_at));
      if (dispatchBucket) dispatchBucket.dispatched += 1;
    }
    if (load.status === 'delivered' && load.updated_at) {
      const deliveryBucket = bucketByKey.get(weekKey(load.updated_at));
      if (deliveryBucket) deliveryBucket.delivered += 1;
    }
  }

  return buckets;
}

// % of delivered loads with a delivery appointment that were actually
// updated to 'delivered' at or before that appointment. Returns null (not 0)
// when there's no delivered-with-appointment data yet, so the UI can show an
// honest "no data" state instead of a misleading 0%.
export function computeOnTimeRate(loads) {
  const delivered = loads.filter((load) => load.status === 'delivered' && load.delivery_appointment_at);
  if (delivered.length === 0) return null;

  const onTime = delivered.filter(
    (load) => new Date(load.updated_at) <= new Date(load.delivery_appointment_at)
  ).length;
  return Math.round((onTime / delivered.length) * 100);
}

export function computeVolumeByCustomer(loads) {
  const counts = new Map();
  for (const load of loads) {
    const customer = load.customer_company ?? 'Unknown';
    counts.set(customer, (counts.get(customer) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([customer, count]) => ({ customer, count }))
    .sort((a, b) => b.count - a.count);
}
