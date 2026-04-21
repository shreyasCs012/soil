from django.urls import path

from .views import (
    FarmListCreateView,
    LatestSensorDataView,
    SensorDataCreateView,
    SensorDataHistoryView,
)

urlpatterns = [
    path('farms/', FarmListCreateView.as_view(), name='farm-list-create'),
    path('sensor-data/', SensorDataCreateView.as_view(), name='sensor-data-create'),
    path('sensor-data/latest/', LatestSensorDataView.as_view(), name='sensor-data-latest'),
    path('sensor-data/history/', SensorDataHistoryView.as_view(), name='sensor-data-history'),
]
