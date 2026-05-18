import { Activity, Droplets, FlaskConical, Leaf, Sprout, Zap } from "lucide-react";
import React, { useEffect, useState } from "react";
import { AiRecommendationPanel } from "../AiRecommendationPanel";
import { MetricCard } from "../MetricCard";
import { TrendChart } from "../TrendChart";
import { WeatherWidget } from "../WeatherWidget";
import { getDashboard } from "../../../services/api";

const icons = {
  moisture: Droplets,
  ph: FlaskConical,
  nitrogen: Leaf,
  phosphorus: Sprout,
  potassium: Zap,
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    getDashboard()
      .then((data) => {
        if (!mounted) return;
        setMetrics(data.metrics || []);
        setTrend(data.trend || []);
      })
      .catch((err: unknown) => {
        if (err instanceof Error) {
          console.error('Failed to load dashboard data:', err);
        } else {
          console.error('Failed to load dashboard data:', String(err));
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Live field intelligence</p>
          <h1>Smart Agro-Advisory System</h1>
          <p className="hero-copy">Monitor soil, nutrients, weather, and irrigation decisions from one farmer-friendly command center.</p>
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
              status={metric.status || 'normal'}
              hint={metric.hint || ''}
              icon={icons[metric.key as keyof typeof icons]}
            />
          ))
        )}
      </section>

      <section className="content-grid">
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

      <section className="content-grid">
        <AiRecommendationPanel />
      </section>
    </div>
  );
}
