import { BatteryMedium, RadioTower } from "lucide-react";
import React, { useEffect, useState } from "react";
import { StatusBadge } from "../StatusBadge";
import { TrendChart } from "../TrendChart";
import {
  getDashboard,
  getLatestSensorData,
  type SensorDataPoint,
  type TrendPoint,
} from "../../../services/api";

type SensorReading = {
  id: string;
  farm: string;
  soil_moisture: number;
  temperature: number;
  humidity: number;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  timestamp: string;
};

function getStatus(moisture: number) {
  if (moisture < 35) return "low";
  if (moisture > 65) return "warning";
  return "normal";
}

function getFarmLabel(farm: SensorDataPoint["farm"]) {
  if (typeof farm === "object" && farm?.name) return farm.name;
  if (farm) return String(farm);
  return "Field";
}

export function SensorsPage() {
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([getLatestSensorData(), getDashboard()])
      .then(([sensors, dashboard]) => {
        if (!mounted) return;
        setSensorReadings(
          sensors.map((reading) => ({
            ...reading,
            id: reading.id || `${getFarmLabel(reading.farm)}-${reading.timestamp}`,
            farm: getFarmLabel(reading.farm),
            timestamp: reading.timestamp ?? new Date().toISOString(),
          })),
        );
        setTrendData(dashboard.trend || []);
      })
      .catch((err) => {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(String(err));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <section className="page-header">
        <p className="eyebrow">Sensors</p>
        <h1>Detailed sensor readings</h1>
        <p>Inspect each station, its latest values and the historical trend from the backend.</p>
      </section>

      {loading ? (
        <div>Loading sensor data...</div>
      ) : error ? (
        <div className="message message-error">{error}</div>
      ) : (
        <section className="sensor-list">
          {sensorReadings.map((sensor) => (
            <article key={sensor.id} className="agro-card sensor-row">
              <div className="flex items-start gap-4">
                <div className="metric-icon">
                  <RadioTower className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">{sensor.farm}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(sensor.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="sensor-reading">
                <div>Moisture: {sensor.soil_moisture}%</div>
                <div>Temp: {sensor.temperature}°C</div>
                <div>pH: {sensor.ph}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={getStatus(sensor.soil_moisture)} />
                <span className="weather-pill">
                  <BatteryMedium className="h-4 w-4" /> {sensor.humidity}% humidity
                </span>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="agro-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>All sensor trend comparison</h2>
          </div>
        </div>
        <TrendChart
          data={trendData}
          metrics={["moisture", "ph", "nitrogen", "phosphorus", "potassium"]}
        />
      </section>
    </div>
  );
}
