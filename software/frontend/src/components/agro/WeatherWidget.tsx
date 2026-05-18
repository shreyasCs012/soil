import { CloudSun, Droplets, Wind } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getWeather, type WeatherData } from "../../services/api";

const DEFAULT_CITY = "Delhi";

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    getWeather(DEFAULT_CITY)
      .then((data) => {
        if (!mounted) return;
        setWeather(data);
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

  if (loading) {
    return (
      <section className="agro-card field-glow">
        <p className="text-sm font-semibold">Loading weather...</p>
      </section>
    );
  }

  if (error || !weather) {
    return (
      <section className="agro-card field-glow">
        <p className="text-sm font-semibold text-destructive">{error || 'Unable to load weather.'}</p>
      </section>
    );
  }

  return (
    <section className="agro-card field-glow">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted-foreground">Weather</p>
          <h2 className="mt-1 text-2xl font-black text-foreground">{weather.temperature}°C</h2>
        </div>
        <CloudSun className="h-10 w-10 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{weather.description}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <span className="weather-pill"><Droplets className="h-4 w-4" /> {weather.humidity}% humidity</span>
        <span className="weather-pill"><Wind className="h-4 w-4" /> {weather.wind_speed} m/s</span>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{weather.city} · {new Date(weather.timestamp).toLocaleTimeString()}</p>
    </section>
  );
}
