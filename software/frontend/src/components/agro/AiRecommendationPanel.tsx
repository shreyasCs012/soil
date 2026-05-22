import { Droplets, FlaskConical, RefreshCw, Sparkles, Thermometer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getLatestSensorData,
  getMe,
  getPesticideRecommendations,
  getCropSoilRecommendation,
} from "../../services/api";

interface AdvisoryItem {
  icon: "humidity" | "temperature" | "ph" | "general";
  name: string;
  description: string;
}

function buildLocalAdvisory(
  humidity: number | null,
  temperature: number | null,
  ph: number | null,
): AdvisoryItem[] {
  const items: AdvisoryItem[] = [];

  // Humidity advisory
  if (humidity !== null) {
    if (humidity > 80) {
      items.push({
        icon: "humidity",
        name: "Reduce irrigation — very high humidity",
        description: `Humidity at ${humidity.toFixed(0)}% — risk of fungal disease. Pause irrigation and improve canopy airflow.`,
      });
    } else if (humidity > 75) {
      items.push({
        icon: "humidity",
        name: "Monitor for fungal risk",
        description: `Humidity at ${humidity.toFixed(0)}% (threshold 75%). Apply Copper Oxychloride 2g/L as preventive fungicide.`,
      });
    } else if (humidity < 45) {
      items.push({
        icon: "humidity",
        name: "Activate irrigation — low humidity",
        description: `Humidity at ${humidity.toFixed(0)}% — soil is drying fast. Irrigate early morning to minimise evaporation loss.`,
      });
    } else {
      items.push({
        icon: "humidity",
        name: "Humidity optimal",
        description: `Humidity at ${humidity.toFixed(0)}% — within healthy range (45–75%). Water pump not required.`,
      });
    }
  }

  // Temperature advisory
  if (temperature !== null) {
    if (temperature > 38) {
      items.push({
        icon: "temperature",
        name: "Heat stress — pump ON 🌡️",
        description: `Temperature ${temperature.toFixed(1)}°C exceeds 38°C. Water pump activated. Apply mulch and mist irrigation to cool soil.`,
      });
    } else if (temperature > 35) {
      items.push({
        icon: "temperature",
        name: "High temperature — water pump ON",
        description: `Temperature ${temperature.toFixed(1)}°C above threshold (35°C). Pump activated. Consider evening irrigation and shade netting.`,
      });
    } else if (temperature < 15) {
      items.push({
        icon: "temperature",
        name: "Low temperature — frost risk",
        description: `Temperature ${temperature.toFixed(1)}°C — protect sensitive crops with row covers. Reduce irrigation frequency.`,
      });
    } else {
      items.push({
        icon: "temperature",
        name: "Temperature normal",
        description: `Temperature ${temperature.toFixed(1)}°C — within optimal crop range (15–35°C). No pump trigger.`,
      });
    }
  }

  // pH advisory
  if (ph !== null) {
    if (ph < 5.5) {
      items.push({
        icon: "ph",
        name: "Highly acidic soil — lime urgently needed",
        description: `pH ${ph.toFixed(1)} is well below 6.2. Apply agricultural lime at 250–300 kg/acre. Re-test after 2 weeks.`,
      });
    } else if (ph < 6.2) {
      items.push({
        icon: "ph",
        name: "Slightly acidic — apply lime",
        description: `pH ${ph.toFixed(1)} is below ideal (6.2–7.4). Apply 100–150 kg/acre dolomitic lime to raise pH gradually.`,
      });
    } else if (ph > 7.8) {
      items.push({
        icon: "ph",
        name: "Alkaline soil — apply sulfur",
        description: `pH ${ph.toFixed(1)} is high. Apply elemental sulfur 50 kg/acre or acidifying fertilisers (ammonium sulfate).`,
      });
    } else if (ph > 7.4) {
      items.push({
        icon: "ph",
        name: "Mildly alkaline — monitor pH",
        description: `pH ${ph.toFixed(1)} slightly above ideal. Use sulfur-coated fertilisers and monitor weekly.`,
      });
    } else {
      items.push({
        icon: "ph",
        name: "pH balanced",
        description: `pH ${ph.toFixed(1)} is within ideal range (6.2–7.4). Nutrient uptake is optimal.`,
      });
    }
  }

  return items;
}

export function AiRecommendationPanel() {
  const [items, setItems]     = useState<AdvisoryItem[]>([]);
  const [crop, setCrop]       = useState<string>("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [user, sensorRows] = await Promise.all([getMe(), getLatestSensorData()]);
      const farm     = user.farms?.[0] as any;
      const farmCrop = farm?.crop_type || "";
      setCrop(farmCrop);

      if (!sensorRows || sensorRows.length === 0) {
        setError("No sensor data — add readings to get recommendations.");
        return;
      }

      const latest    = sensorRows[0];
      const humidity    = latest.humidity    != null ? Number(latest.humidity)    : null;
      const temperature = latest.temperature != null ? Number(latest.temperature) : null;
      const ph          = latest.ph          != null ? Number(latest.ph)          : null;

      // Build local advisory from humidity, temperature, and pH
      const localItems = buildLocalAdvisory(humidity, temperature, ph);

      // Optionally fetch LLM pesticide rec if crop is set (uses humidity/temp context)
      let extra: AdvisoryItem[] = [];
      const farmId =
        typeof latest.farm === "string"
          ? latest.farm
          : typeof latest.farm === "object" && latest.farm !== null
          ? (latest.farm as any).id ?? (latest.farm as any).name
          : undefined;

      if (farmId && farmCrop) {
        try {
          const pesticide = await getPesticideRecommendations(farmId, farmCrop);
          extra.push({
            icon: "general",
            name: pesticide.pesticide_name,
            description: `${pesticide.condition} — ${pesticide.dosage}`,
          });
        } catch { /* skip if unavailable */ }
      }

      setItems([...localItems, ...extra]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendations.");
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => { load(); }, [load]);

  function IconFor({ type }: { type: AdvisoryItem["icon"] }) {
    if (type === "humidity")    return <Droplets   className="h-4 w-4" />;
    if (type === "temperature") return <Thermometer className="h-4 w-4" />;
    if (type === "ph")          return <FlaskConical className="h-4 w-4" />;
    return <Sparkles className="h-4 w-4" />;
  }

  return (
    <section className="agro-card recommendation-panel col-span-full">
      <div className="flex items-center gap-3">
        <div className="metric-icon" aria-hidden="true">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="eyebrow">AI advisory</p>
          <h2 className="text-xl font-black text-foreground">
            Field recommendations
            {crop && <span className="rec-crop-tag">{crop}</span>}
          </h2>
        </div>
        <button
          className="rec-refresh-btn"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          title="Refresh recommendations"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <ul className="fertilizer-list">
        {loading ? (
          <li className="fertilizer-item fertilizer-loading">
            <span className="auth-spinner" /> Loading recommendations…
          </li>
        ) : error ? (
          <li className="fertilizer-item fertilizer-error">{error}</li>
        ) : (
          items.map((item, i) => (
            <li key={i} className="fertilizer-item">
              <span className="fertilizer-icon"><IconFor type={item.icon} /></span>
              <div>
                <p className="fertilizer-name">{item.name}</p>
                <p className="fertilizer-desc">{item.description}</p>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
