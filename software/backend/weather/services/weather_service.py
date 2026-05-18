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


def get_mongo_collection():
    global _mongo_client, _index_created

    if not settings.MONGODB_URI or not settings.MONGODB_NAME:
        raise WeatherServiceError(
            'MongoDB configuration is missing. Please set MONGODB_URI and MONGODB_NAME.',
            status_code=503,
        )

    if _mongo_client is None:
        try:
            _mongo_client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
        except errors.PyMongoError as exc:
            raise WeatherServiceError(
                f'Unable to connect to MongoDB: {exc}', status_code=503
            )

    collection = _mongo_client[settings.MONGODB_NAME].weather_searches

    if not _index_created:
        collection.create_index('city_lower', unique=True)
        _index_created = True

    return collection


def fetch_weather_from_api(city: str) -> dict:
    if not settings.OPENWEATHERMAP_API_KEY:
        raise WeatherServiceError(
            'OpenWeatherMap API key is not configured.', status_code=503
        )

    try:
        response = requests.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params={
                'q': city,
                'appid': settings.OPENWEATHERMAP_API_KEY,
                'units': 'metric',
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
    except requests.HTTPError as exc:
        if response.status_code == 404:
            raise WeatherServiceError(
                'City not found. Please check the spelling and try again.', status_code=404
            )
        raise WeatherServiceError(
            f'OpenWeatherMap returned an error: {exc}', status_code=502
        )
    except requests.RequestException as exc:
        raise WeatherServiceError(
            f'Network error while fetching weather data: {exc}', status_code=502
        )

    weather_info = (data.get('weather') or [{}])[0]
    icon_code = weather_info.get('icon', '')
    icon_url = f'https://openweathermap.org/img/wn/{icon_code}@2x.png' if icon_code else ''

    return {
        'city': data.get('name', city).strip(),
        'city_lower': data.get('name', city).strip().lower(),
        'temperature': data.get('main', {}).get('temp'),
        'humidity': data.get('main', {}).get('humidity'),
        'description': weather_info.get('description', '').capitalize(),
        'wind_speed': data.get('wind', {}).get('speed'),
        'icon': icon_code,
        'icon_url': icon_url,
        'timestamp': datetime.utcnow(),
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


def get_cached_weather(city: str, max_age_minutes: int = 10) -> dict | None:
    collection = get_mongo_collection()
    city_lower = city.strip().lower()
    document = collection.find_one({'city_lower': city_lower})

    if not document:
        return None

    age = datetime.utcnow() - document.get('timestamp', datetime.utcnow())
    if age <= timedelta(minutes=max_age_minutes):
        return _normalize_document(document)

    return None


def get_latest_search() -> dict | None:
    collection = get_mongo_collection()
    document = collection.find_one({}, sort=[('timestamp', -1)])
    return _normalize_document(document) if document else None


def save_weather_search(payload: dict) -> dict:
    collection = get_mongo_collection()
    document = {
        'city': payload['city'],
        'city_lower': payload['city_lower'],
        'temperature': payload['temperature'],
        'humidity': payload['humidity'],
        'description': payload['description'],
        'wind_speed': payload['wind_speed'],
        'icon': payload['icon'],
        'icon_url': payload['icon_url'],
        'timestamp': payload['timestamp'],
    }

    try:
        collection.update_one(
            {'city_lower': document['city_lower']},
            {
                '$set': document,
                '$setOnInsert': {'created_at': document['timestamp']},
            },
            upsert=True,
        )
    except errors.PyMongoError as exc:
        raise WeatherServiceError(
            f'Unable to save weather search data: {exc}', status_code=503
        )

    return _normalize_document(document)


def search_weather(city: str, cache_minutes: int = 10) -> dict:
    if not city.strip():
        raise WeatherServiceError('A city name is required.', status_code=400)

    cached = get_cached_weather(city, max_age_minutes=cache_minutes)
    if cached:
        cached.pop('city_lower', None)
        return cached

    payload = fetch_weather_from_api(city)
    return save_weather_search(payload)


def get_recent_searches(limit: int = 8) -> list[dict]:
    collection = get_mongo_collection()
    try:
        cursor = collection.find({}, {'_id': 0}).sort('timestamp', -1).limit(limit)
        return [_normalize_document(document) for document in cursor]
    except errors.PyMongoError as exc:
        raise WeatherServiceError(
            f'Unable to load recent searches: {exc}', status_code=503
        )
