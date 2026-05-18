from datetime import datetime, timedelta

import requests
from django.conf import settings
from pymongo import MongoClient, errors

_mongo_client = None
_index_created = False


class WeatherServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _get_mongo_collection():
    """Return the weather_searches collection, or None if MongoDB is unavailable."""
    global _mongo_client, _index_created

    if not getattr(settings, 'MONGODB_URI', '').strip() or \
       not getattr(settings, 'MONGODB_NAME', '').strip():
        return None

    try:
        if _mongo_client is None:
            _mongo_client = MongoClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=3000,
            )

        collection = _mongo_client[settings.MONGODB_NAME].weather_searches

        if not _index_created:
            collection.create_index('city_lower', unique=True)
            _index_created = True

        return collection
    except errors.PyMongoError:
        return None


def fetch_weather_from_api(city: str = None, lat: float = None, lon: float = None) -> dict:
    api_key = getattr(settings, 'OPENWEATHERMAP_API_KEY', '').strip()
    if not api_key:
        raise WeatherServiceError(
            'OpenWeatherMap API key is not configured.', status_code=503
        )

    if lat is not None and lon is not None:
        params = {
            'lat': lat,
            'lon': lon,
            'appid': api_key,
            'units': 'metric',
        }
    elif city:
        params = {
            'q': city.strip(),
            'appid': api_key,
            'units': 'metric',
        }
    else:
        raise WeatherServiceError(
            'Either a city name or lat/lon coordinates are required.', status_code=400
        )

    try:
        response = requests.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params=params,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
    except requests.HTTPError:
        if response.status_code == 404:
            raise WeatherServiceError(
                'City not found. Please check the spelling and try again.', status_code=404
            )
        if response.status_code == 401:
            raise WeatherServiceError(
                'OpenWeatherMap rejected the API key.', status_code=502
            )
        raise WeatherServiceError(
            f'OpenWeatherMap returned HTTP {response.status_code}.', status_code=502
        )
    except requests.RequestException as exc:
        raise WeatherServiceError(
            f'Network error while fetching weather: {exc}', status_code=502
        )

    weather_info = (data.get('weather') or [{}])[0]
    icon_code = weather_info.get('icon', '')
    resolved_city = data.get('name', city or '').strip()

    return {
        'city':        resolved_city,
        'city_lower':  resolved_city.lower(),
        'temperature': data.get('main', {}).get('temp'),
        'humidity':    data.get('main', {}).get('humidity'),
        'description': weather_info.get('description', '').capitalize(),
        'wind_speed':  data.get('wind', {}).get('speed'),
        'icon':        icon_code,
        'icon_url':    f'https://openweathermap.org/img/wn/{icon_code}@2x.png' if icon_code else '',
        'timestamp':   datetime.utcnow(),
    }


def _normalize_document(document: dict) -> dict:
    if not document:
        return {}
    document = document.copy()
    document.pop('_id', None)
    document.pop('city_lower', None)
    timestamp = document.get('timestamp')
    if isinstance(timestamp, datetime):
        document['timestamp'] = timestamp.isoformat() + 'Z'
    return document


def _get_cached_weather(city: str, max_age_minutes: int = 10) -> dict | None:
    """Return cached weather for a city if fresh enough, else None."""
    collection = _get_mongo_collection()
    if collection is None:
        return None
    try:
        doc = collection.find_one({'city_lower': city.strip().lower()})
        if not doc:
            return None
        age = datetime.utcnow() - doc.get('timestamp', datetime.utcnow())
        if age <= timedelta(minutes=max_age_minutes):
            return _normalize_document(doc)
    except errors.PyMongoError:
        pass
    return None


def _save_weather(payload: dict) -> None:
    """Silently upsert weather data into MongoDB (best-effort)."""
    collection = _get_mongo_collection()
    if collection is None:
        return
    try:
        doc = {k: v for k, v in payload.items() if k != '_id'}
        collection.update_one(
            {'city_lower': doc['city_lower']},
            {'$set': doc, '$setOnInsert': {'created_at': doc['timestamp']}},
            upsert=True,
        )
    except errors.PyMongoError:
        pass


def search_weather(city: str = None, lat: float = None, lon: float = None,
                   cache_minutes: int = 10) -> dict:
    """
    Fetch weather by city name or GPS coordinates.
    MongoDB cache/save failures are silently swallowed — weather always comes first.
    """
    if not city and (lat is None or lon is None):
        raise WeatherServiceError(
            'A city name or lat/lon coordinates are required.', status_code=400
        )

    # Try city cache (skip for raw-coord lookups — city name unknown until API responds)
    if city:
        cached = _get_cached_weather(city, max_age_minutes=cache_minutes)
        if cached:
            return cached

    # Hit the live API
    payload = fetch_weather_from_api(city=city, lat=lat, lon=lon)

    # Best-effort cache write — never blocks the response
    _save_weather(payload)

    return _normalize_document(payload)


def get_latest_search() -> dict | None:
    collection = _get_mongo_collection()
    if collection is None:
        return None
    try:
        doc = collection.find_one({}, sort=[('timestamp', -1)])
        return _normalize_document(doc) if doc else None
    except errors.PyMongoError:
        return None


def get_recent_searches(limit: int = 8) -> list[dict]:
    collection = _get_mongo_collection()
    if collection is None:
        return []
    try:
        cursor = collection.find({}, {'_id': 0}).sort('timestamp', -1).limit(limit)
        return [_normalize_document(doc) for doc in cursor]
    except errors.PyMongoError:
        return []
