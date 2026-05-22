import { AlertTriangle, CheckCircle2, Droplets, Thermometer } from "lucide-react";
import { useEffect, useState } from "react";
import { getAlerts, getLatestSensorData, getMe } from "../../../services/api";

const THRESHOLD_KEY = "agro_thresholds";
const DEFAULT_THRESHOLDS = { moisture: 35, ph_min: 6.2, ph_max: 7.4, humidity: 75, temperature: 35 };

function readLocalThresholds() {
  try {
    const raw = localStorage.getItem(THRESHOLD_KEY);
    if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_THRESHOLDS;
}

export function AlertsPage() {
  const [alerts, setAlerts]   = useState<any[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        // Fetch backend alerts, latest sensor reading, and farm thresholds in parallel
        const [backendAlerts, sensorRows, user] = await Promise.all([
          getAlerts(),
          getLatestSensorData(),
          getMe(),
        ]);

        if (!mounted) return;

        // Prefer DB thresholds; fall back to localStorage if API fails
        const farm = user?.farms?.[0];
        const thresholds = farm
          ? {
              moisture:    farm.moisture_threshold    ?? DEFAULT_THRESHOLDS.moisture,
              ph_min:      farm.ph_min               ?? DEFAULT_THRESHOLDS.ph_min,
              ph_max:      farm.ph_max               ?? DEFAULT_THRESHOLDS.ph_max,
              humidity:    farm.humidity_threshold    ?? DEFAULT_THRESHOLDS.humidity,
              temperature: farm.temperature_threshold ?? DEFAULT_THRESHOLDS.temperature,
            }
          : readLocalThresholds();
        const extra: any[] = [];

        if (sensorRows && sensorRows.length > 0) {
          const latest = sensorRows[0];
          const humidity    = Number(latest.humidity    ?? 0);
          const temperature = Number(latest.temperature ?? 0);
          const now = new Date().toLocaleString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          });

          if (humidity > thresholds.humidity) {
            extra.push({
              id:       "pump-humidity-client",
              priority: "High",
              time:     now,
              title:    "💧 Water pump is ON — high humidity",
              detail:   `Humidity is ${humidity.toFixed(1)}% — above your threshold of ${thresholds.humidity}%. Irrigation pump activated automatically.`,
              action:   "Monitor water usage and soil saturation",
              zone:     "Field sensor",
            });
          }

          if (temperature > thresholds.temperature) {
            extra.push({
              id:       "pump-temperature-client",
              priority: "High",
              time:     now,
              title:    "🌡️ Water pump is ON — high temperature",
              detail:   `Temperature is ${temperature.toFixed(1)}°C — above your threshold of ${thresholds.temperature}°C. Pump activated to prevent heat stress.`,
              action:   "Check field for heat stress; consider shade netting",
              zone:     "Field sensor",
            });
          }
        }

        // Merge: put pump alerts first, then backend alerts (de-dupe by id prefix)
        const backendIds = new Set((backendAlerts || []).map((a: any) => a.id));
        const deduped = extra.filter((a) => !backendIds.has(a.id.replace("-client", "")));
        setAlerts([...deduped, ...(backendAlerts || [])]);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="page-stack">
      <section className="page-header">
        <p className="eyebrow">Smart alerts</p>
        <h1>Prioritized field actions</h1>
        <p>Alerts ranked by urgency — humidity and temperature thresholds trigger the water pump automatically.</p>
      </section>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading alerts...</div>
      ) : error ? (
        <div className="message message-error">{error}</div>
      ) : alerts.length === 0 ? (
        <div className="text-sm text-muted-foreground">No alerts are active — all sensor values within safe thresholds.</div>
      ) : (
        <section className="alert-list">
          {alerts.map((alert) => {
            const isPumpAlert = alert.id?.startsWith("pump-");
            return (
              <article
                key={alert.id}
                className={`agro-card alert-card priority-${alert.priority.toLowerCase()}${isPumpAlert ? " pump-alert" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="metric-icon">
                      {isPumpAlert && alert.id.includes("humidity")   ? <Droplets className="h-5 w-5" />    :
                       isPumpAlert && alert.id.includes("temperature") ? <Thermometer className="h-5 w-5" /> :
                       <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="alert-priority">{alert.priority} priority · {alert.time}</p>
                      <h2 className="mt-1 text-xl font-black text-foreground">{alert.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.detail}</p>
                    </div>
                  </div>
                  <span className="sync-pill">{alert.zone}</span>
                </div>
                <div className="alert-action"><CheckCircle2 className="h-5 w-5" /> {alert.action}</div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
