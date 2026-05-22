import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

type TrendPoint = {
  time: string;
  moisture?: number;
  ph?: number;
  humidity?: number;
  temperature?: number;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
};

type ChartMetric = "moisture" | "ph" | "humidity" | "temperature" | "nitrogen" | "phosphorus" | "potassium";

export function TrendChart({ data, metrics }: { data: TrendPoint[]; metrics: ChartMetric[] }) {
  const colors: Record<ChartMetric, string> = {
    moisture:    "var(--chart-moisture)",
    ph:          "var(--chart-ph)",
    humidity:    "#60a5fa",   /* blue-400  */
    temperature: "#f97316",  /* orange-500 */
    nitrogen:    "var(--chart-nitrogen)",
    phosphorus:  "var(--chart-phosphorus)",
    potassium:   "var(--chart-potassium)",
  };

  const labels: Record<ChartMetric, string> = {
    moisture:    "Moisture (%)",
    ph:          "pH",
    humidity:    "Humidity (%)",
    temperature: "Temperature (°C)",
    nitrogen:    "Nitrogen (ppm)",
    phosphorus:  "Phosphorus (ppm)",
    potassium:   "Potassium (ppm)",
  };

  return (
    <div className="chart-shell" aria-label="Historical sensor trend chart">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 16, right: 18, bottom: 8, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 8" vertical={false} />
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              color: "var(--popover-foreground)",
            }}
            formatter={(value: number, name: string) => [
              typeof value === "number" ? value.toFixed(2) : value,
              labels[name as ChartMetric] ?? name,
            ]}
          />
          {metrics.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={colors[metric]}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Accessibility: data table for screen readers */}
      <div className="sr-only" role="region" aria-label="Chart data table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              {metrics.map((m) => (
                <th key={m}>{labels[m]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((point, idx) => (
              <tr key={idx}>
                <td>{point.time}</td>
                {metrics.map((m) => (
                  <td key={m}>{point[m] != null ? Number(point[m]).toFixed(2) : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
