import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getCropRecommendations,
  getLatestSensorData,
  getPesticideRecommendations,
  type CropRecommendation,
  type PesticideRecommendation,
} from "../../services/api";

export function AiRecommendationPanel() {
  const [cropRecommendation, setCropRecommendation] = useState<CropRecommendation | null>(null);
  const [pesticideRecommendation, setPesticideRecommendation] =
    useState<PesticideRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadRecommendations() {
      try {
        const [latestReading] = await getLatestSensorData();
        if (!latestReading) {
          if (mounted) setError("No sensor readings available for recommendations.");
          return;
        }

        const crop = await getCropRecommendations(latestReading.farm);
        const pesticide = await getPesticideRecommendations(
          latestReading.farm,
          crop.recommended_crop,
        );

        if (!mounted) return;
        setCropRecommendation(crop);
        setPesticideRecommendation(pesticide);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadRecommendations();

    return () => {
      mounted = false;
    };
  }, []);

  const recommendations = [
    cropRecommendation
      ? `Plant ${cropRecommendation.recommended_crop} (${Math.round(cropRecommendation.confidence_score * 100)}% confidence). ${cropRecommendation.reason}`
      : null,
    pesticideRecommendation
      ? `Use ${pesticideRecommendation.pesticide_name} for ${pesticideRecommendation.condition}. Dosage: ${pesticideRecommendation.dosage}.`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="agro-card recommendation-panel">
      <div className="flex items-center gap-3">
        <div className="metric-icon" aria-hidden="true">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-muted-foreground">AI Fertilizer Recommendation</p>
          <h2 className="text-xl font-black text-foreground">Next best actions</h2>
        </div>
      </div>
      <ul className="mt-5 space-y-3">
        {loading ? (
          <li className="recommendation-item">Loading recommendations...</li>
        ) : error ? (
          <li className="recommendation-item">{error}</li>
        ) : (
          recommendations.map((item) => (
            <li key={item} className="recommendation-item">
              {item}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
