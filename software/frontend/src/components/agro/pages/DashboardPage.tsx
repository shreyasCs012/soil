import { Activity, CheckCircle2, Droplets, FlaskConical, Leaf, Save, Sprout, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiRecommendationPanel } from "../AiRecommendationPanel";
import { MetricCard } from "../MetricCard";
import { TrendChart } from "../TrendChart";
import { WeatherWidget } from "../WeatherWidget";
import { CropCombobox } from "../CropCombobox";
import { getDashboard, getMe, updateFarm } from "../../../services/api";
import type { FarmData } from "../../../services/api";

type MetricData = {
  key: string;
  label: string;
  value: number;
  unit: string;
  status?: "low" | "normal" | "warning";
  hint?: string;
};

type TrendData = {
  timestamp: string;
  [key: string]: string | number;
};

const icons: Record<string, React.ComponentType<any>> = {
  moisture: Droplets,
  ph: FlaskConical,
  nitrogen: Leaf,
  phosphorus: Sprout,
  potassium: Zap,
};

const SOIL_TYPES = [
  "Alluvial Soil",
  "Black Cotton Soil (Regur)",
  "Red Laterite Soil",
  "Red and Yellow Soil",
  "Laterite Soil",
  "Arid / Desert Soil",
  "Saline and Alkaline Soil",
  "Peaty / Marshy Soil",
  "Forest / Mountain Soil",
  "Clay Loam",
  "Sandy Loam",
  "Sandy Soil",
  "Loamy Soil",
  "Silty Loam",
  "Silty Soil",
  "Clay Soil",
  "Chalky Soil",
  "Peaty Soil",
];

export function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [trend, setTrend] = useState<TrendData[]>([]);
  const [farm, setFarm] = useState<FarmData | null>(null);
  const [cropType, setCropType] = useState("");
  const [soilType, setSoilType] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    getDashboard()
      .then((data) => {
        if (!mounted) return;
        setMetrics(data.metrics || []);
        setTrend((data.trend || []).map((point: any) => ({
          timestamp: point.timestamp || new Date().toISOString(),
          ...point,
        })));
        setError(null);
          setLoading(false);
      })
      .catch((err: unknown) => {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : "Failed to load dashboard data";
          console.error("Failed to load dashboard data:", errorMessage);
          setError(errorMessage);
            setLoading(false);
        }
      });

    getMe()
      .then((user) => {
        if (!mounted) return;
        const f = user.farms?.[0];
        if (!f) return;
        setFarm(f);
        setCropType(f.crop_type ?? "");
        setSoilType(f.soil_type ?? "");
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSaveFarm() {
    if (!farm) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFarm(farm.id, {
        crop_type: cropType,
        soil_type: soilType,
      });
      setFarm({ ...farm, ...updated });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive-foreground">
          <p className="font-medium">Failed to load dashboard data</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <section className="hero-band">
        <div>
          <p className="eyebrow">Live field intelligence</p>
          <h1>Smart Agro-Advisory System</h1>
          <p className="hero-copy">
            Monitor soil, nutrients, weather, and irrigation decisions from one farmer-friendly command center.
          </p>
        </div>
        <div className="hero-status" aria-label="System status">
          <Activity className="h-5 w-5" />
          <span>All stations syncing</span>
        </div>
      </section>

      <section className="metric-grid" aria-label="Real-time sensor data">
        {metrics.length === 0 ? (
          <div>Loading metrics...</div>
        ) : (
          metrics.map((metric) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              value={metric.value}
              unit={metric.unit}
              status={metric.status || "normal"}
              hint={metric.hint || ""}
              icon={icons[metric.key]}
            />
          ))
        )}
      </section>

      {farm && (
        <section className="content-grid">
          <div className="agro-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Farm settings</p>
                <h2>Crop &amp; Soil type</h2>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div className="farm-profile-field">
                <label className="farm-profile-label">
                  <Leaf className="h-3.5 w-3.5" /> Crop type
                </label>
                <CropCombobox id="dashboard-crop" value={cropType} onChange={setCropType} />
              </div>

              <div className="farm-profile-field">
                <label className="farm-profile-label" htmlFor="dashboard-soil">
                  <Sprout className="h-3.5 w-3.5" /> Soil type
                </label>
                <select
                  id="dashboard-soil"
                  className="farm-profile-input"
                  value={soilType}
                  onChange={(e) => setSoilType(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  <option value="">Select soil type...</option>
                  {SOIL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="auth-error" role="alert" style={{ marginBottom: "1rem" }}>
                {error}
              </p>
            )}

            <button
              className="farm-save-btn"
              onClick={handleSaveFarm}
              disabled={saving}
              style={{ width: "100%" }}
            >
              {saved ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Saved!
                </>
              ) : saving ? (
                <>
                  <span className="auth-spinner" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Save changes
                </>
              )}
            </button>
          </div>
        </section>
      )}

      <section className="content-grid">
        <AiRecommendationPanel />
        <div className="agro-card lg:col-span-2">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Historical trends</p>
              <h2>Sensor patterns today</h2>
            </div>
            <span className="sync-pill">Updated now</span>
          </div>
          <TrendChart data={trend} metrics={["moisture", "nitrogen", "potassium"]} />
        </div>
        <WeatherWidget />
      </section>
    </div>
  );
}
