from django.views.generic import TemplateView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services.weather_service import (
    WeatherServiceError,
    get_latest_search,
    get_recent_searches,
    search_weather,
)


class WeatherPageView(TemplateView):
    template_name = 'weather/weather_search.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['latest_search'] = get_latest_search()
        context['recent_searches'] = get_recent_searches()
        return context


class WeatherSearchApiView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        city = request.query_params.get('city', '').strip()
        if not city:
            return Response({'detail': 'Please enter a city name.'}, status=400)

        try:
            weather_data = search_weather(city)
            return Response(weather_data)
        except WeatherServiceError as exc:
            return Response({'detail': str(exc)}, status=exc.status_code)
