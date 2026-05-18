from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services.weather_service import WeatherServiceError, search_weather


class WeatherSearchApiView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        city = request.query_params.get('city', '').strip() or None
        lat_str = request.query_params.get('lat', '').strip()
        lon_str = request.query_params.get('lon', '').strip()

        try:
            lat = float(lat_str) if lat_str else None
            lon = float(lon_str) if lon_str else None
        except ValueError:
            return Response({'detail': 'Invalid lat/lon values.'}, status=400)

        if not city and (lat is None or lon is None):
            return Response(
                {'detail': 'Provide a city name (?city=) or coordinates (?lat=&lon=).'},
                status=400,
            )

        try:
            data = search_weather(city=city, lat=lat, lon=lon)
            return Response(data)
        except WeatherServiceError as exc:
            return Response({'detail': str(exc)}, status=exc.status_code)
