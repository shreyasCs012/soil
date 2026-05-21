import { TrendingDown, TrendingUp, Minus, FlaskConical, Leaf, Sprout, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { getLatestSensorData, getSoilPrediction, type SoilPrediction } from "../../services/api";

type Trend = 'rising' | 'falling' | 'stable';

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === 'rising') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === 'falling') return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function PredictCard({
  label,
  value,
  unit,
  trend,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  trend: Trend;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="predict-item">
      <div className="predict-icon" style={{ background: color }}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="predict-label">{label}</p>
      <div className="predict-value-row">
        <span className="predict-value">{value}</span>
        <span className="predict-unit">{unit}</span>
        <TrendIcon trend={trend} />
      </div>
    </div>
  );
}

export function SoilPredictionPanel() {
  const [prediction, setPrediction] = useState<SoilPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        // Try to resolve farmId from the latest reading; proceed without it if unavailable
        let farmId: string | number | undefined;
        try {
          const [latest] = await getLatestSensorData();
          if (latest) {
            farmId = typeof latest.farm === 'object' && latest.farm !== null
              ? (latest.farm as { id?: string | number }).id ?? String(latest.farm)
              : String(latest.farm);
          }
         } catch (err) {
           console.warn("Could not resolve farm ID; relying on JWT scope:", err instanceof Error ? err.message : String(err));
         }

        const pred = await getSoilPrediction(farmId);
        if (mounted) setPrediction(pred);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  const predictItems = prediction ? [
    { label: 'pH', value: prediction.predicted_ph, unit: 'pH', trend: prediction.ph_trend, icon: FlaskConical, color: 'oklch(0.55 0.128 305 / 18%)' },
    { label: 'Nitrogen', value: prediction.predicted_nitrogen, unit: 'ppm', trend: prediction.npk_trend, icon: Leaf, color: 'oklch(0.53 0.145 145 / 18%)' },
    { label: 'Phosphorus', value: prediction.predicted_phosphorus, unit: 'ppm', trend: prediction.npk_trend, icon: Sprout, color: 'oklch(0.73 0.14 84 / 18%)' },
    { label: 'Potassium', value: prediction.predicted_potassium, unit: 'ppm', trend: prediction.npk_trend, icon: Zap, color: 'oklch(0.62 0.16 38 / 18%)' },
  ] : [];

  return (
    <section className="agro-card prediction-forecast-panel">
      <div className="prediction-header">
        <div className="prediction-badge">AI Forecast</div>
        <h2 className="prediction-title">3-Day Soil Outlook</h2>
        <p className="prediction-subtitle">Predicted pH &amp; NPK levels based on historical trends</p>
      </div>

      {loading ? (
        <div className="predict-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="predict-item predict-skeleton" />
          ))}
        </div>
      ) : error ? (
        <p className="predict-error">{error}</p>
      ) : prediction ? (
        <>
          <div className="predict-grid">
            {predictItems.map((item) => (
              <PredictCard key={item.label} {...item} />
            ))}
          </div>
          <div className="predict-confidence">
            <div className="predict-confidence-bar">
              <div
                className="predict-confidence-fill"
                style={{ width: `${Math.round(prediction.confidence * 100)}%` }}
              />
            </div>
            <span className="predict-confidence-label">
              {Math.round(prediction.confidence * 100)}% confidence
            </span>
          </div>
          {prediction.analysis && (
            <p className="predict-analysis">{prediction.analysis}</p>
          )}
        </>
      ) : null}
    </section>
  );
}
