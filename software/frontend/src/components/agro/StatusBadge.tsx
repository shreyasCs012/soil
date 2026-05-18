type StatusLevel = 'low' | 'normal' | 'warning';

const statusCopy: Record<StatusLevel, string> = {
  low: "Low",
  normal: "Normal",
  warning: "Warning",
};

export function StatusBadge({ status }: { status: StatusLevel }) {
  return <span className={`status-badge status-${status}`}>{statusCopy[status]}</span>;
}
