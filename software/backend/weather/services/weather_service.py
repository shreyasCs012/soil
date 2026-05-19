"""
Weather service with automatic API tier detection:

  Priority 1 — One Call API 3.0 (lat/lon only, requires paid subscription)
    GET https://api.openweathermap.org/data/3.0/onecall
  Priority 2 — Current Weather 2.5 (free tier, city name or lat/lon)
    GET https://api.openweathermap.org/data/2.5/weather

For city-name lookups the Geocoding API converts the name to lat/lon first
so One Call 3.0 can be used.  If any step returns 401/subscription-required
the service falls back to 2.5/weather transparently.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

import requests
from django.conf import settings
from pymongo import MongoClient, errors

logger = logging.getLogger(__name__)

_mongo_client   = None
_index_created  = False

# Endpoints
_ONE_CALL_URL   = "https://api.openweathermap.org/data/3.0/onecall"
_WEATHER25_URL  = "https://api.openweathermap.org/data/2.5/weather"
_GEO_URL        = "http://api.openweathermap.org/geo/1.0/direct"
_REV_GEO_URL    = "http://api.openweathermap.org/geo/1.0/reverse"


class WeatherServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


# ── MongoDB (best-effort, never blocks weather) ──────────────────────────────

def _get_col():
    global _mongo_client, _index_created
    uri  = getattr(settings, "MONGODB_URI",  "").strip()
    name = getattr(settings, "MONGODB_NAME", "").strip()
    if not uri or not name:
        return None
    try:
        if _mongo_client is None:
            _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        col = _mongo_client[name].weather_searches
        if not _index_created:
            col.create_index("city_lower", unique=True)
            _index_created = True
        return col
    except errors.PyMongoError:
        return None


def _normalize(doc: dict) -> dict:
    if not doc:
        return {}
    doc = doc.copy()
    doc.pop("_id", None)
    doc.pop("city_lower", None)
    ts = doc.get("timestamp")
    if isinstance(ts, datetime):
        doc["timestamp"] = ts.isoformat() + "Z"
    return doc


def _get_cached(city: str, max_age: int = 10) -> dict | None:
    col = _get_col()
    if col is None:
        return None
    try:
        doc = col.find_one({"city_lower": city.strip().lower()})
        if doc and (datetime.utcnow() - doc.get("timestamp", datetime.utcnow())) <= timedelta(minutes=max_age):
            return _normalize(doc)
    except errors.PyMongoError:
        pass
    return None


def _save(payload: dict) -> None:
    col = _get_col()
    if col is None:
        return
    try:
        doc = {k: v for k, v in payload.items() if k != "_id"}
        col.update_one(
            {"city_lower": doc["city_lower"]},
            {"$set": doc, "$setOnInsert": {"created_at": doc["timestamp"]}},
            upsert=True,
        )
    except errors.PyMongoError:
        pass


# ── API key ──────────────────────────────────────────────────────────────────

def _key() -> str:
    k = getattr(settings, "OPENWEATHERMAP_API_KEY", "").strip()
    if not k:
        raise WeatherServiceError("OpenWeatherMap API key is not configured.", status_code=503)
    return k


# ── Geocoding (free tier — works with any key) ───────────────────────────────

def _geocode(city: str) -> tuple[float, float, str]:
    """city name → (lat, lon, display_name)"""
    try:
        r = requests.get(_GEO_URL,
            params={"q": city.strip(), "limit": 1, "appid": _key()}, timeout=8)
        r.raise_for_status()
        data = r.json()
    except requests.HTTPError:
        # Geocoding API may 401 with One Call-only keys — return stub so
        # we can fall back to 2.5/weather with the raw city string
        return None, None, city
    except requests.RequestException as exc:
        raise WeatherServiceError(f"Geocoding network error: {exc}", status_code=502)

    if not data:
        raise WeatherServiceError(
            f'City "{city}" not found. Check the spelling.', status_code=404)

    item = data[0]
    name = item.get("local_names", {}).get("en") or item.get("name", city)
    country = item.get("country", "")
    display = f"{name}, {country}" if country else name
    return item["lat"], item["lon"], display


def _reverse_geocode(lat: float, lon: float) -> str:
    """lat/lon → display city name"""
    try:
        r = requests.get(_REV_GEO_URL,
            params={"lat": lat, "lon": lon, "limit": 1, "appid": _key()}, timeout=8)
        r.raise_for_status()
        data = r.json()
        if data:
            name    = data[0].get("local_names", {}).get("en") or data[0].get("name", "")
            country = data[0].get("country", "")
            return f"{name}, {country}" if country else name
    except requests.RequestException:
        pass
    return f"{lat:.4f}, {lon:.4f}"


# ── Weather fetch (One Call 3.0 → 2.5 fallback) ──────────────────────────────

def _fetch_one_call(lat: float, lon: float, city_name: str) -> dict | None:
    """
    Try One Call 3.0.  Returns None if the key lacks subscription (401).
    Raises WeatherServiceError for other failures.
    """
    try:
        r = requests.get(_ONE_CALL_URL, params={
            "lat": lat, "lon": lon, "appid": _key(),
            "units": "metric", "exclude": "minutely,hourly,daily,alerts",
        }, timeout=10)
    except requests.RequestException as exc:
        raise WeatherServiceError(f"Network error: {exc}", status_code=502)

    if r.status_code == 401:
        logger.debug("One Call 3.0 returned 401 — falling back to 2.5/weather")
        return None                      # caller will try 2.5

    if not r.ok:
        raise WeatherServiceError(f"OpenWeatherMap error {r.status_code}.", status_code=502)

    data    = r.json()
    current = data.get("current", {})
    winfo   = (current.get("weather") or [{}])[0]
    icon    = winfo.get("icon", "")
    return {
        "city":        city_name,
        "city_lower":  city_name.lower(),
        "temperature": round(current.get("temp", 0), 1),
        "feels_like":  round(current.get("feels_like", 0), 1),
        "humidity":    current.get("humidity"),
        "wind_speed":  current.get("wind_speed"),
        "description": winfo.get("description", "").capitalize(),
        "icon":        icon,
        "icon_url":    f"https://openweathermap.org/img/wn/{icon}@2x.png" if icon else "",
        "uvi":         current.get("uvi"),
        "timestamp":   datetime.utcnow(),
    }


def _fetch_25(city: str = None, lat: float = None, lon: float = None) -> dict:
    """Free-tier 2.5/weather endpoint — supports both city name and lat/lon."""
    params = {"appid": _key(), "units": "metric"}
    if city:
        params["q"] = city.strip()
    else:
        params["lat"] = lat
        params["lon"] = lon

    try:
        r = requests.get(_WEATHER25_URL, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
    except requests.HTTPError:
        if r.status_code == 401:
            raise WeatherServiceError("Invalid API key.", status_code=401)
        if r.status_code == 404:
            raise WeatherServiceError(
                f'City "{city}" not found.' if city else "Location not found.", status_code=404)
        raise WeatherServiceError(f"OpenWeatherMap error {r.status_code}.", status_code=502)
    except requests.RequestException as exc:
        raise WeatherServiceError(f"Network error: {exc}", status_code=502)

    winfo = (data.get("weather") or [{}])[0]
    icon  = winfo.get("icon", "")
    name  = data.get("name", city or f"{lat},{lon}").strip()
    return {
        "city":        name,
        "city_lower":  name.lower(),
        "temperature": round(data.get("main", {}).get("temp", 0), 1),
        "feels_like":  round(data.get("main", {}).get("feels_like", 0), 1),
        "humidity":    data.get("main", {}).get("humidity"),
        "wind_speed":  data.get("wind", {}).get("speed"),
        "description": winfo.get("description", "").capitalize(),
        "icon":        icon,
        "icon_url":    f"https://openweathermap.org/img/wn/{icon}@2x.png" if icon else "",
        "uvi":         None,
        "timestamp":   datetime.utcnow(),
    }


# ── Public interface ─────────────────────────────────────────────────────────

def search_weather(city: str = None, lat: float = None, lon: float = None,
                   cache_minutes: int = 10) -> dict:
    """
    Fetch current weather by city name or GPS coordinates.
    Tries One Call 3.0 first; falls back to 2.5/weather automatically.
    MongoDB cache/save errors are silently ignored.
    """
    if not city and (lat is None or lon is None):
        raise WeatherServiceError(
            "Provide ?city= or ?lat=&lon= coordinates.", status_code=400)

    # ── City-name path ────────────────────────────────────────────────────
    if city:
        cached = _get_cached(city, max_age=cache_minutes)
        if cached:
            return cached

        # Try to geocode so we can use One Call 3.0
        geo_lat, geo_lon, display = _geocode(city)

        payload = None
        if geo_lat is not None:
            payload = _fetch_one_call(geo_lat, geo_lon, display)

        if payload is None:
            # geocode failed or One Call not subscribed → 2.5 with raw city string
            payload = _fetch_25(city=city)

    # ── Lat/lon path ──────────────────────────────────────────────────────
    else:
        city_name = _reverse_geocode(lat, lon)
        payload   = _fetch_one_call(lat, lon, city_name)

        if payload is None:
            # One Call not subscribed → 2.5 with lat/lon (returns city name in response)
            payload = _fetch_25(lat=lat, lon=lon)

    _save(payload)
    return _normalize(payload)


def get_latest_search() -> dict | None:
    col = _get_col()
    if col is None:
        return None
    try:
        doc = col.find_one({}, sort=[("timestamp", -1)])
        return _normalize(doc) if doc else None
    except errors.PyMongoError:
        return None


def get_recent_searches(limit: int = 8) -> list[dict]:
    col = _get_col()
    if col is None:
        return []
    try:
        return [_normalize(d) for d in
                col.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit)]
    except errors.PyMongoError:
        return []
