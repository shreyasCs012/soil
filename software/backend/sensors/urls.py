from django.urls import path

from .views import (
    FarmListCreateView,
    FarmUpdateView,
    LatestSensorDataView,
    SensorDataCreateView,
    SensorDataHistoryView,
    DashboardView,
    AlertsView,
)
from .irrigation_views import (
    CompartmentsView,
    ComputeMixView,
    TrendAlertsView,
    TriggerIrrigationView,
)

urlpatterns = [
    path('farms/', FarmListCreateView.as_view(), name='farm-list-create'),
    path('farms/<int:pk>/', FarmUpdateView.as_view(), name='farm-update'),
    path('sensor-data/', SensorDataCreateView.as_view(), name='sensor-data-create'),
    path('sensor-data/latest/', LatestSensorDataView.as_view(), name='sensor-data-latest'),
    path('sensor-data/history/', SensorDataHistoryView.as_view(), name='sensor-data-history'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('alerts/', AlertsView.as_view(), name='alerts'),
    path('irrigation/compartments/', CompartmentsView.as_view(), name='irrigation-compartments'),
    path('irrigation/compute-mix/', ComputeMixView.as_view(), name='irrigation-compute-mix'),
    path('irrigation/trend-alerts/', TrendAlertsView.as_view(), name='irrigation-trend-alerts'),
    path('irrigation/trigger/', TriggerIrrigationView.as_view(), name='irrigation-trigger'),
]
