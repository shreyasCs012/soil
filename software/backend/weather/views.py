import requests
from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class WeatherView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        city = request.query_params.get('city', 'Delhi')
        cache_key = f'weather:{city.lower()}'
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        if not settings.OPENWEATHERMAP_API_KEY:
            return Response(
                {'detail': 'OpenWeatherMap API key is not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            response = requests.get(
                'https://api.openweathermap.org/data/2.5/weather',
                params={'q': city, 'appid': settings.OPENWEATHERMAP_API_KEY, 'units': 'metric'},
                timeout=8,
            )
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as exc:
            return Response(
                {'detail': f'Unable to fetch weather data: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        payload = {
            'city': data.get('name'),
            'temperature': data.get('main', {}).get('temp'),
            'humidity': data.get('main', {}).get('humidity'),
            'description': (data.get('weather') or [{}])[0].get('description'),
            'wind_speed': data.get('wind', {}).get('speed'),
        }
        cache.set(cache_key, payload, 60 * 10)
        return Response(payload)
