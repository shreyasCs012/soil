import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type StatusLevel = 'low' | 'normal' | 'warning';

type MetricCardProps = {
  label: string;
  value: number;
  unit: string;
  status: StatusLevel;
  hint: string;
  icon: LucideIcon;
};

export function MetricCard({ label, value, unit, status, hint, icon: Icon }: MetricCardProps) {
  return (
    <article className={`agro-card metric-card metric-${status}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="metric-icon" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-6">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <div className="mt-2 flex items-end gap-2">
          <strong className="text-4xl font-black tracking-normal text-foreground">{value}</strong>
          <span className="pb-1 text-sm font-bold text-muted-foreground">{unit}</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{hint}</p>
      </div>
    </article>
  );
}
