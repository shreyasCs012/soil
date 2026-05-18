import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

type TrendPoint = {
  time: string;
  moisture: number;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
};

type ChartMetric = "moisture" | "ph" | "nitrogen" | "phosphorus" | "potassium";

export function TrendChart({ data, metrics }: { data: TrendPoint[]; metrics: ChartMetric[] }) {
  const colors: Record<ChartMetric, string> = {
    moisture: "var(--chart-moisture)",
    ph: "var(--chart-ph)",
    nitrogen: "var(--chart-nitrogen)",
    phosphorus: "var(--chart-phosphorus)",
    potassium: "var(--chart-potassium)",
  };

  return (
    <div className="chart-shell" aria-label="Historical sensor trend chart">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 16, right: 18, bottom: 8, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 8" vertical={false} />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px", color: "var(--popover-foreground)" }} />
          {metrics.map((metric) => (
            <Line key={metric} type="monotone" dataKey={metric} stroke={colors[metric]} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
