import { CloudSun, Droplets, Locate, Wind } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getMe, getWeather, getWeatherByCoords, type WeatherData } from "../../services/api";

const FALLBACK_CITY = "Delhi";

type LocSource = "gps" | "farm" | "default";

interface WeatherResult {
  data: WeatherData;
  source: LocSource;
}

async function fetchWeather(): Promise<WeatherResult> {
  // 1. Browser GPS
  if (navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 6000,
        })
      );
      const data = await getWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
      return { data, source: "gps" };
    } catch {
      // denied or timed out — try next
    }
  }

  // 2. Farm's stored location
  try {
    const user = await getMe();
    const farm = user.farms?.[0];
    if (farm && farm.latitude && farm.longitude) {
      const data = await getWeatherByCoords(farm.latitude, farm.longitude);
      return { data, source: "farm" };
    }
    if (farm?.location?.trim()) {
      const data = await getWeather(farm.location.trim());
      return { data, source: "farm" };
    }
  } catch {
    // no auth / no farm — fall through
  }

  // 3. Default city
  const data = await getWeather(FALLBACK_CITY);
  return { data, source: "default" };
}

const SOURCE_BADGE: Record<LocSource, { label: string; cls: string }> = {
  gps:     { label: "GPS",     cls: "weather-source-gps"     },
  farm:    { label: "Farm",    cls: "weather-source-farm"    },
  default: { label: "Default", cls: "weather-source-default" },
};

export function WeatherWidget() {
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchWeather()
      .then((r) => { if (mounted) setResult(r); })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : "Unable to load weather."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <section className="agro-card field-glow weather-widget-card">
        <div className="weather-loading">
          <Locate className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Fetching weather…</span>
        </div>
      </section>
    );
  }

  if (error || !result) {
    return (
      <section className="agro-card field-glow weather-widget-card">
        <p className="text-sm font-semibold text-destructive">{error ?? "Unable to load weather."}</p>
      </section>
    );
  }

  const { data: weather, source } = result;
  const badge = SOURCE_BADGE[source];

  return (
    <section className="agro-card field-glow weather-widget-card">
      {/* Header */}
      <div className="weather-header">
        <div>
          <div className="weather-eyebrow">
            <p className="eyebrow">Live weather</p>
            <span className={`weather-source-badge ${badge.cls}`}>
              {source === "gps" && <Locate className="h-2.5 w-2.5" />}
              {badge.label}
            </span>
          </div>
          <h2 className="weather-temp">{weather.temperature}°C</h2>
        </div>
        {weather.icon_url
          ? <img src={weather.icon_url} alt={weather.description} className="weather-icon-img" />
          : <CloudSun className="weather-icon-fallback" aria-hidden />
        }
      </div>

      {/* Description */}
      <p className="weather-desc">{weather.description}</p>

      {/* Stats */}
      <div className="weather-stats">
        <span className="weather-pill"><Droplets className="h-4 w-4" /> {weather.humidity}% humidity</span>
        <span className="weather-pill"><Wind className="h-4 w-4" /> {weather.wind_speed} m/s</span>
      </div>

      {/* Footer */}
      <p className="weather-footer">
        {weather.city} · {new Date(weather.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </section>
  );
}
