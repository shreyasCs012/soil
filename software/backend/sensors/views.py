from datetime import timedelta

from django.utils import timezone
from rest_framework import generics

from .models import Farm, SensorData
from .serializers import FarmSerializer, SensorDataSerializer


class FarmListCreateView(generics.ListCreateAPIView):
    serializer_class = FarmSerializer

    def get_queryset(self):
        return Farm.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SensorDataCreateView(generics.CreateAPIView):
    serializer_class = SensorDataSerializer


class LatestSensorDataView(generics.ListAPIView):
    serializer_class = SensorDataSerializer

    def get_queryset(self):
        farm_id = self.request.query_params.get('farm_id')
        qs = SensorData.objects.filter(farm__user=self.request.user).select_related('farm')
        if farm_id:
            qs = qs.filter(farm_id=farm_id)
        latest_ids = {}
        for row in qs.order_by('farm_id', '-timestamp'):
            if row.farm_id not in latest_ids:
                latest_ids[row.farm_id] = row.id
        return SensorData.objects.filter(id__in=latest_ids.values()).order_by('-timestamp')


class SensorDataHistoryView(generics.ListAPIView):
    serializer_class = SensorDataSerializer

    def get_queryset(self):
        farm_id = self.request.query_params.get('farm_id')
        days = int(self.request.query_params.get('days', 7))
        start_time = timezone.now() - timedelta(days=days)
        qs = SensorData.objects.filter(farm__user=self.request.user, timestamp__gte=start_time)
        if farm_id:
            qs = qs.filter(farm_id=farm_id)
        return qs
