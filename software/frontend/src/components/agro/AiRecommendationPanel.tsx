import { FlaskConical, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  getLatestSensorData,
  getMe,
  getPesticideRecommendations,
  getCropSoilRecommendation,
} from "../../services/api";

interface FertilizerItem {
  name: string;
  description: string;
}

export function AiRecommendationPanel() {
  const [items, setItems]       = useState<FertilizerItem[]>([]);
  const [crop, setCrop]         = useState<string>("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Get current farm crop type
      const user = await getMe();
      const farm = user.farms?.[0] as any;
      const farmCrop = farm?.crop_type || "";
      setCrop(farmCrop);

      // Get latest sensor data for farm ID
      const [latestReading] = await getLatestSensorData();
      if (!latestReading) {
        setError("No sensor data — add readings to get recommendations.");
        return;
      }

      const farmId =
        typeof latestReading.farm === "string"
          ? latestReading.farm
          : typeof latestReading.farm === "object" && latestReading.farm !== null
          ? latestReading.farm.id ?? latestReading.farm.name
          : undefined;

      if (farmId === undefined) {
        setError("Invalid farm identifier from sensor data.");
        return;
      }

      const results: FertilizerItem[] = [];

      // Pesticide / fertilizer recommendation based on saved crop
      if (farmCrop) {
        const pesticide = await getPesticideRecommendations(farmId, farmCrop);
        results.push({
          name: pesticide.pesticide_name,
          description: `${pesticide.condition} — ${pesticide.dosage}`,
        });
      }

      // Soil-for-crop recommendation (gives fertilizer/amendment advice)
      const soilRec = await getCropSoilRecommendation(farmId, farmCrop || undefined);
      if (soilRec.recommendations?.length) {
        // Show up to 2 recommendations as separate items
        soilRec.recommendations.slice(0, 2).forEach((rec: string) => {
          const [head, ...rest] = rec.split(":");
          results.push({
            name: head.trim(),
            description: rest.join(":").trim() || rec,
          });
        });
      }

      setItems(results.length ? results : [{ name: "No recommendations", description: "Sensor data may be insufficient." }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendations.");
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="agro-card recommendation-panel col-span-full">
      <div className="flex items-center gap-3">
        <div className="metric-icon" aria-hidden="true">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="eyebrow">AI advisory</p>
          <h2 className="text-xl font-black text-foreground">
            Fertilizer recommendations
            {crop && <span className="rec-crop-tag">{crop}</span>}
          </h2>
        </div>
        <button
          className="rec-refresh-btn"
          onClick={() => setRefreshKey(k => k + 1)}
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
              <span className="fertilizer-icon"><FlaskConical className="h-4 w-4" /></span>
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
