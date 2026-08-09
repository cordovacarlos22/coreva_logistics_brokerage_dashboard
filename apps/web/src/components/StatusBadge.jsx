const LABELS = {
  pending: 'Pending',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  dropped: 'Dropped',
};

const COLOR_CLASS = {
  pending: 'bg-status-assigned',
  assigned: 'bg-status-assigned',
  picked_up: 'bg-status-picked-up',
  in_transit: 'bg-status-in-transit',
  delivered: 'bg-status-delivered',
  dropped: 'bg-status-dropped',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white ${
        COLOR_CLASS[status] ?? 'bg-status-assigned'
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
