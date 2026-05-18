from django.urls import path

from .views import WeatherSearchApiView

urlpatterns = [
    path('', WeatherSearchApiView.as_view(), name='weather_api_search'),
]
