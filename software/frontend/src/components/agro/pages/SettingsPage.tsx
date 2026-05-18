import { useState } from "react";
import { Bell, Droplets, FlaskConical, Leaf } from "lucide-react";

export function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [irrigationOn, setIrrigationOn] = useState(false);
  const [thresholds, setThresholds] = useState({ moisture: 35, ph: 6.2, npk: 45 });

  return (
    <div className="page-stack">
      <section className="page-header">
        <p className="eyebrow">Control center</p>
        <h1>Settings & irrigation</h1>
        <p>Simulate irrigation and tune alert thresholds for future backend integration.</p>
      </section>

      <section className="content-grid">
        <article className="agro-card irrigation-card">
          <p className="eyebrow">Irrigation control</p>
          <h2>System is {irrigationOn ? "ON" : "OFF"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Current pump state is simulated locally for the demo dashboard.</p>
          <button className="irrigation-toggle" aria-pressed={irrigationOn} onClick={() => setIrrigationOn((value) => !value)}>
            <span>{irrigationOn ? "Stop irrigation" : "Start irrigation"}</span>
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </button>
        </article>

        <article className="agro-card">
          <div className="flex items-center gap-3">
            <div className="metric-icon"><Bell className="h-5 w-5" /></div>
            <div>
              <p className="eyebrow">Notifications</p>
              <h2 className="text-xl font-black text-foreground">Alert delivery</h2>
            </div>
          </div>
          <label className="setting-switch mt-6">
            <span>Enable smart notifications</span>
            <input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} />
          </label>
        </article>
      </section>

      <section className="agro-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Thresholds</p>
            <h2>Sensor alert levels</h2>
          </div>
        </div>
        <div className="threshold-grid">
          <ThresholdControl icon={Droplets} label="Moisture" unit="%" value={thresholds.moisture} onChange={(value) => setThresholds((prev) => ({ ...prev, moisture: value }))} min={15} max={70} />
          <ThresholdControl icon={FlaskConical} label="pH" unit="pH" value={thresholds.ph} onChange={(value) => setThresholds((prev) => ({ ...prev, ph: value }))} min={4} max={8} step={0.1} />
          <ThresholdControl icon={Leaf} label="NPK" unit="ppm" value={thresholds.npk} onChange={(value) => setThresholds((prev) => ({ ...prev, npk: value }))} min={20} max={90} />
        </div>
      </section>
    </div>
  );
}

type ThresholdControlProps = {
  icon: typeof Droplets;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

function ThresholdControl({ icon: Icon, label, unit, value, min, max, step = 1, onChange }: ThresholdControlProps) {
  return (
    <label className="threshold-control">
      <span className="flex items-center gap-3"><Icon className="h-5 w-5 text-primary" /> {label}</span>
      <strong>{value}{unit}</strong>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
