from django.urls import path

from .views import WeatherPageView

urlpatterns = [
    path('', WeatherPageView.as_view(), name='weather_search'),
]
