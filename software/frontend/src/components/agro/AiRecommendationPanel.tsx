import { FlaskConical, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getCropRecommendations,
  getLatestSensorData,
  getPesticideRecommendations,
} from "../../services/api";

interface FertilizerItem {
  name: string;
  description: string;
}

export function AiRecommendationPanel() {
  const [items, setItems]   = useState<FertilizerItem[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [latestReading] = await getLatestSensorData();
        if (!latestReading) {
          if (mounted) setError("No sensor data — add readings to get recommendations.");
          return;
        }

        const farmId =
          typeof latestReading.farm === "string"
            ? latestReading.farm
            : latestReading.farm.id ?? latestReading.farm.name;

        const crop      = await getCropRecommendations(farmId);
        const pesticide = await getPesticideRecommendations(farmId, crop.recommended_crop);

        if (!mounted) return;

        setItems([
          {
            name: pesticide.pesticide_name,
            description: `${pesticide.condition} — ${pesticide.dosage}`,
          },
          {
            name: crop.recommended_crop,
            description: crop.reason.split(".")[0].trim() + ".",
          },
        ]);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load recommendations.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <section className="agro-card recommendation-panel col-span-full">
      <div className="flex items-center gap-3">
        <div className="metric-icon" aria-hidden="true">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="eyebrow">AI advisory</p>
          <h2 className="text-xl font-black text-foreground">Fertilizer recommendations</h2>
        </div>
      </div>

      <ul className="fertilizer-list">
        {loading ? (
          <li className="fertilizer-item fertilizer-loading">
            <span className="auth-spinner" /> Loading recommendations…
          </li>
        ) : error ? (
          <li className="fertilizer-item fertilizer-error">{error}</li>
        ) : items.length === 0 ? (
          <li className="fertilizer-item fertilizer-error">No recommendations available.</li>
        ) : (
          items.map((item) => (
            <li key={item.name} className="fertilizer-item">
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
