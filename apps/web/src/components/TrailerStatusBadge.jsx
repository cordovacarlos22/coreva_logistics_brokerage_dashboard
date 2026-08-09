const COLOR_CLASS = {
  available: 'bg-status-delivered',
  in_use: 'bg-status-in-transit',
  dropped: 'bg-status-dropped',
  maintenance: 'bg-status-assigned',
};

export default function TrailerStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white ${
        COLOR_CLASS[status] ?? 'bg-status-assigned'
      }`}
    >
      {status?.replace('_', ' ') ?? 'Unknown'}
    </span>
  );
}
