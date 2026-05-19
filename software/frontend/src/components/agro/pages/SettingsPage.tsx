import { Bell, CheckCircle2, ChevronDown, Droplets, FlaskConical, Leaf, Locate, MapPin, Save, Sprout } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CropCombobox } from "../CropCombobox";
import { getMe, updateFarm, type FarmData } from "../../../services/api";

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

// ── Farm Profile card ─────────────────────────────────────────────────────
function FarmProfileCard() {
  const [farm, setFarm] = useState<FarmData | null>(null);
  const [cropType, setCropType]   = useState("");
  const [soilType, setSoilType]   = useState("");
  const [locLabel, setLocLabel]   = useState("");
  const [lat, setLat]             = useState<number | null>(null);
  const [lng, setLng]             = useState<number | null>(null);
  const [locating, setLocating]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMe().then((user) => {
      const f = user.farms?.[0];
      if (!f) return;
      setFarm(f);
      setCropType(f.crop_type ?? "");
      setSoilType(f.soil_type ?? "");
      setLat(f.latitude ?? null);
      setLng(f.longitude ?? null);
      if (f.latitude && f.longitude) {
        setLocLabel(`${f.latitude.toFixed(5)}, ${f.longitude.toFixed(5)}`);
      } else if (f.location) {
        setLocLabel(f.location);
      }
    }).catch(() => {});
  }, []);

  function captureLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        setLocLabel(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setLocating(false);
      },
      (err) => {
        setError(
          err.code === 1
            ? "Location access denied. Please allow location in your browser settings."
            : "Could not get location. Please try again."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSave() {
    if (!farm) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFarm(farm.id, {
        crop_type: cropType,
        soil_type: soilType,
        latitude:  lat,
        longitude: lng,
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

  if (!farm) {
    return (
      <article className="agro-card">
        <p className="eyebrow">Farm profile</p>
        <p className="text-sm text-muted-foreground mt-2">Loading farm details…</p>
      </article>
    );
  }

  return (
    <article className="agro-card farm-profile-card">
      <div className="farm-profile-header">
        <div className="metric-icon"><Sprout className="h-5 w-5" /></div>
        <div>
          <p className="eyebrow">Farm profile</p>
          <h2 className="farm-profile-title">{farm.name}</h2>
        </div>
      </div>

      <div className="farm-profile-body">
        {/* Crop type */}
        <div className="farm-profile-field">
          <label className="farm-profile-label">
            <Leaf className="h-3.5 w-3.5" /> Crop type
          </label>
          <CropCombobox
            id="settings-crop"
            value={cropType}
            onChange={setCropType}
          />
        </div>

        {/* Soil type */}
        <div className="farm-profile-field">
          <label className="farm-profile-label" htmlFor="settings-soil">
            <Sprout className="h-3.5 w-3.5" /> Soil type
          </label>
          <div className="farm-select-wrap">
            <select
              id="settings-soil"
              className="farm-profile-select"
              value={soilType}
              onChange={(e) => setSoilType(e.target.value)}
            >
              <option value="">— Select soil type —</option>
              {SOIL_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="farm-select-chevron" />
          </div>
        </div>

        {/* Location */}
        <div className="farm-profile-field">
          <label className="farm-profile-label">
            <MapPin className="h-3.5 w-3.5" /> Farm location
          </label>
          <div className="farm-location-row">
            <input
              className="farm-profile-input farm-location-input"
              type="text"
              readOnly
              placeholder="Click 'Use my location' to detect"
              value={locLabel}
            />
            <button
              type="button"
              className="farm-locate-btn"
              onClick={captureLocation}
              disabled={locating}
              title="Use my current GPS location"
            >
              <Locate className={`h-4 w-4 ${locating ? "animate-spin" : ""}`} />
              {locating ? "Locating…" : "Use my location"}
            </button>
          </div>
          {lat && lng && (
            <p className="farm-coords-hint">
              Lat {lat.toFixed(6)}, Lng {lng.toFixed(6)}
              <span className="farm-coords-badge">GPS</span>
            </p>
          )}
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button
          className="farm-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saved
            ? <><CheckCircle2 className="h-4 w-4" /> Saved!</>
            : saving
              ? <><span className="auth-spinner" /> Saving…</>
              : <><Save className="h-4 w-4" /> Save changes</>
          }
        </button>
      </div>
    </article>
  );
}

// ── Threshold control ─────────────────────────────────────────────────────
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
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [irrigationOn, setIrrigationOn]   = useState(false);
  const [thresholds, setThresholds]       = useState({ moisture: 35, ph: 6.2, npk: 45 });

  return (
    <div className="page-stack">
      <section className="page-header">
        <p className="eyebrow">Control center</p>
        <h1>Settings</h1>
        <p>Edit your farm profile, tune alert thresholds, and control irrigation.</p>
      </section>

      {/* ── Farm profile ──────────────────────────────────── */}
      <FarmProfileCard />

      {/* ── Irrigation + notifications ────────────────────── */}
      <section className="content-grid">
        <article className="agro-card irrigation-card">
          <p className="eyebrow">Irrigation control</p>
          <h2>System is {irrigationOn ? "ON" : "OFF"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Current pump state is simulated locally for the demo dashboard.
          </p>
          <button
            className="irrigation-toggle"
            aria-pressed={irrigationOn}
            onClick={() => setIrrigationOn((v) => !v)}
          >
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
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
            />
          </label>
        </article>
      </section>

      {/* ── Thresholds ────────────────────────────────────── */}
      <section className="agro-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Thresholds</p>
            <h2>Sensor alert levels</h2>
          </div>
        </div>
        <div className="threshold-grid">
          <ThresholdControl icon={Droplets}     label="Moisture" unit="%" value={thresholds.moisture} onChange={(v) => setThresholds((p) => ({ ...p, moisture: v }))} min={15} max={70} />
          <ThresholdControl icon={FlaskConical} label="pH"       unit="pH" value={thresholds.ph}      onChange={(v) => setThresholds((p) => ({ ...p, ph: v }))}      min={4}  max={8}  step={0.1} />
          <ThresholdControl icon={Leaf}         label="NPK"      unit="ppm" value={thresholds.npk}    onChange={(v) => setThresholds((p) => ({ ...p, npk: v }))}     min={20} max={90} />
        </div>
      </section>
    </div>
  );
}
