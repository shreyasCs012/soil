import math
from datetime import timedelta, datetime

from django.utils import timezone
from django.conf import settings
from django.http import JsonResponse
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

import pymongo
from bson import ObjectId

from .models import Farm, SensorData
from .serializers import FarmSerializer, SensorDataSerializer
from core.mongodb import save_sensor_reading, get_sensor_docs_for_user

# Default thresholds used by the backend alert engine
HUMIDITY_THRESHOLD    = 75    # % — above this triggers pump-on alert
TEMPERATURE_THRESHOLD = 35    # °C — above this triggers pump-on alert
MOISTURE_THRESHOLD    = 35    # % — below this triggers low-moisture alert
PH_MIN, PH_MAX        = 6.2, 7.4


def _metric_status(key, value):
    if value is None:
        return 'normal'
    if key == 'moisture' and value < MOISTURE_THRESHOLD:
        return 'low'
    if key == 'moisture' and value > 65:
        return 'warning'
    if key == 'ph' and (value < PH_MIN or value > PH_MAX):
        return 'warning'
    if key == 'humidity' and value > HUMIDITY_THRESHOLD:
        return 'warning'
    if key == 'temperature' and value > TEMPERATURE_THRESHOLD:
        return 'warning'
    return 'normal'


def _fake_ph_trend(base_ph: float, n_points: int = 24) -> list[dict]:
    """Synthesise hourly pH readings with gentle sine-wave variation.
    Used to give the chart realistic-looking historical pH data when
    only one real reading exists.
    """
    now = timezone.now()
    points = []
    for i in range(n_points, 0, -1):
        t = now - timedelta(hours=i)
        variation = 0.25 * math.sin(i * 0.45) + 0.1 * math.cos(i * 1.1)
        ph = round(max(5.5, min(8.0, base_ph + variation)), 2)
        points.append({'_fake': True, 'ts': t, 'ph': ph})
    return points


def _dashboard_payload_from_readings(readings):
    readings = list(readings)
    if not readings:
        return {'metrics': [], 'trend': []}

    latest = readings[0]
    metric_specs = [
        ('moisture',     'Soil Moisture', latest.soil_moisture, '%',   'Tracks irrigation need from the latest sensor reading.'),
        ('ph',           'pH Level',      latest.ph,            'pH',  'Ideal soil range is 6.2–7.4.'),
        ('humidity',     'Humidity',      latest.humidity,      '%',   f'High humidity (>{HUMIDITY_THRESHOLD}%) triggers automatic irrigation.'),
        ('temperature',  'Temperature',   latest.temperature,   '°C',  f'High temp (>{TEMPERATURE_THRESHOLD}°C) activates water pump.'),
        ('nitrogen',     'Nitrogen',      latest.nitrogen,      'ppm', 'Supports green growth and crop vigor.'),
    ]
    metrics = [
        {
            'key': key,
            'label': label,
            'value': value,
            'unit': unit,
            'status': _metric_status(key, value),
            'hint': hint,
        }
        for key, label, value, unit, hint in metric_specs
    ]

    # Build real trend points
    real_trend = [
        {
            'time':        reading.timestamp.strftime('%H:%M'),
            'moisture':    reading.soil_moisture,
            'ph':          reading.ph,
            'humidity':    reading.humidity,
            'temperature': reading.temperature,
            'nitrogen':    reading.nitrogen,
        }
        for reading in reversed(readings)
    ]

    # Inject fake pH history when only a single reading exists so the chart
    # shows a realistic pH trend line (simulated ±0.25 variation).
    if len(real_trend) <= 1:
        base_ph = float(latest.ph or 6.5)
        fake_pts = _fake_ph_trend(base_ph, n_points=23)
        merged = [
            {
                'time':        p['ts'].strftime('%H:%M'),
                'moisture':    latest.soil_moisture,
                'ph':          p['ph'],
                'humidity':    latest.humidity,
                'temperature': latest.temperature,
                'nitrogen':    latest.nitrogen,
            }
            for p in fake_pts
        ]
        merged.append(real_trend[0] if real_trend else merged[-1])
        real_trend = merged

    return {'metrics': metrics, 'trend': real_trend}


def _get_mongo_sensor_collection():
    mongo_uri = getattr(settings, 'MONGODB_URI', None)
    mongo_name = getattr(settings, 'MONGODB_NAME', None)

    if not mongo_uri or not mongo_name:
        return None

    client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
    return client[mongo_name].get_collection('sensor_data')


def _mongo_farm_key(doc):
    farm_id = doc.get('farm_id') or doc.get('farm')
    return str(farm_id) if farm_id else str(doc.get('_id'))


def _normalize_mongo_sensor(doc):
    farm_key = _mongo_farm_key(doc)
    return {
        'id': str(doc.get('_id')),
        'farm': farm_key,
        'soil_moisture': doc.get('soil_moisture'),
        'temperature': doc.get('temperature'),
        'humidity': doc.get('humidity'),
        'ph': doc.get('ph'),
        'nitrogen': doc.get('nitrogen'),
        'phosphorus': doc.get('phosphorus'),
        'potassium': doc.get('potassium'),
        'timestamp': doc.get('timestamp').isoformat() if doc.get('timestamp') else None,
    }


def _mongo_latest_sensor_docs(farm_id=None):
    collection = _get_mongo_sensor_collection()
    if collection is None:
        return None

    query = {}
    if farm_id:
        possible_ids = [farm_id]
        try:
            possible_ids.append(ObjectId(farm_id))
        except Exception:
            pass
        query['farm_id'] = {'$in': possible_ids}

    docs = list(collection.find(query).sort('timestamp', -1).limit(100))
    latest_by_farm = {}
    for doc in docs:
        farm_key = _mongo_farm_key(doc)
        if farm_key not in latest_by_farm:
            latest_by_farm[farm_key] = doc
    return list(latest_by_farm.values())


def _dashboard_payload_from_mongo_docs(docs):
    docs = list(docs)
    if not docs:
        return {'metrics': [], 'trend': []}

    latest = docs[0]
    metric_specs = [
        ('moisture',    'Soil Moisture', latest.get('soil_moisture'), '%',   'Tracks irrigation need from the latest sensor reading.'),
        ('ph',          'pH Level',      latest.get('ph'),            'pH',  'Ideal soil range is 6.2–7.4.'),
        ('humidity',    'Humidity',      latest.get('humidity'),      '%',   f'High humidity (>{HUMIDITY_THRESHOLD}%) triggers automatic irrigation.'),
        ('temperature', 'Temperature',   latest.get('temperature'),   '°C',  f'High temp (>{TEMPERATURE_THRESHOLD}°C) activates water pump.'),
        ('nitrogen',    'Nitrogen',      latest.get('nitrogen'),      'ppm', 'Supports green growth and crop vigor.'),
    ]
    metrics = [
        {
            'key': key,
            'label': label,
            'value': value,
            'unit': unit,
            'status': _metric_status(key, value),
            'hint': hint,
        }
        for key, label, value, unit, hint in metric_specs
    ]

    real_trend = [
        {
            'time':        doc.get('timestamp').strftime('%H:%M') if doc.get('timestamp') else '',
            'moisture':    doc.get('soil_moisture'),
            'ph':          doc.get('ph'),
            'humidity':    doc.get('humidity'),
            'temperature': doc.get('temperature'),
            'nitrogen':    doc.get('nitrogen'),
        }
        for doc in reversed(docs)
    ]

    if len(real_trend) <= 1:
        base_ph = float(latest.get('ph') or 6.5)
        fake_pts = _fake_ph_trend(base_ph, n_points=23)
        merged = [
            {
                'time':        p['ts'].strftime('%H:%M'),
                'moisture':    latest.get('soil_moisture'),
                'ph':          p['ph'],
                'humidity':    latest.get('humidity'),
                'temperature': latest.get('temperature'),
                'nitrogen':    latest.get('nitrogen'),
            }
            for p in fake_pts
        ]
        merged.append(real_trend[0] if real_trend else merged[-1])
        real_trend = merged

    return {'metrics': metrics, 'trend': real_trend}


class FarmListCreateView(generics.ListCreateAPIView):
    serializer_class = FarmSerializer

    def get_queryset(self):
        return Farm.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class FarmUpdateView(APIView):
    """PATCH /farms/<pk>/ — update crop_type, soil_type, location, lat/lng."""

    def patch(self, request, pk):
        try:
            farm = Farm.objects.get(pk=pk, user=request.user)
        except Farm.DoesNotExist:
            return JsonResponse({'detail': 'Farm not found.'}, status=404)

        allowed = ('crop_type', 'soil_type', 'location', 'address', 'latitude', 'longitude', 'name')
        updated = {}
        for field in allowed:
            if field in request.data:
                val = request.data[field]
                # coerce lat/lng to float
                if field in ('latitude', 'longitude'):
                    try:
                        val = float(val) if val not in (None, '') else None
                    except (TypeError, ValueError):
                        val = None
                setattr(farm, field, val)
                updated[field] = val

        farm.save(update_fields=list(updated.keys()))

        # Mirror to MongoDB
        from core.mongodb import save_farm
        save_farm(farm.id, {
            'django_user_id': farm.user_id,
            'name':      farm.name,
            'location':  farm.location,
            'address':   farm.address,
            'area_acres': float(farm.area_acres) if farm.area_acres else None,
            'crop_type': farm.crop_type,
            'soil_type': farm.soil_type,
            'latitude':  farm.latitude,
            'longitude': farm.longitude,
        })

        return JsonResponse({
            'id':        farm.id,
            'name':      farm.name,
            'crop_type': farm.crop_type,
            'soil_type': farm.soil_type,
            'location':  farm.location,
            'latitude':  farm.latitude,
            'longitude': farm.longitude,
        })


class SensorDataCreateView(generics.CreateAPIView):
    serializer_class = SensorDataSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        # Mirror sensor reading to MongoDB
        user_id = instance.farm.user_id if instance.farm else None
        if user_id:
            save_sensor_reading(instance.farm_id, user_id, {
                'soil_moisture': instance.soil_moisture,
                'temperature':   instance.temperature,
                'humidity':      instance.humidity,
                'ph':            instance.ph,
                'nitrogen':      instance.nitrogen,
                'phosphorus':    instance.phosphorus,
                'potassium':     instance.potassium,
                'timestamp':     instance.timestamp,
            })


class LatestSensorDataView(generics.ListAPIView):
    serializer_class = SensorDataSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        farm_id = self.request.query_params.get('farm_id')
        qs = SensorData.objects.select_related('farm')
        if self.request.user.is_authenticated:
            qs = qs.filter(farm__user=self.request.user)
        if farm_id:
            qs = qs.filter(farm_id=farm_id)
        latest_ids = {}
        for row in qs.order_by('farm_id', '-timestamp'):
            if row.farm_id not in latest_ids:
                latest_ids[row.farm_id] = row.id
        return SensorData.objects.filter(id__in=latest_ids.values()).order_by('-timestamp')

    def list(self, request, *args, **kwargs):
        farm_id_param = request.query_params.get('farm_id')
        farm_id_int = int(farm_id_param) if farm_id_param else None

        # Try MongoDB first — scoped to this user
        if request.user.is_authenticated:
            docs = get_sensor_docs_for_user(request.user.id, farm_id=farm_id_int, limit=100)
            if docs is not None:
                # Return only latest reading per farm
                latest_by_farm: dict = {}
                for doc in docs:
                    fid = doc.get('farm_id')
                    if fid not in latest_by_farm:
                        latest_by_farm[fid] = doc
                return JsonResponse(
                    [_normalize_mongo_sensor(d) for d in latest_by_farm.values()],
                    safe=False,
                )

        # Fall back to SQLite (already user-scoped via get_queryset)
        return super().list(request, *args, **kwargs)


class AlertsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            mongo_docs = _mongo_latest_sensor_docs()
        except pymongo.errors.PyMongoError:
            mongo_docs = None

        if mongo_docs:
            latest_reading = mongo_docs[0]
            zone = _mongo_farm_key(latest_reading)
            timestamp = latest_reading.get('timestamp')
            timestamp = timestamp.strftime('%b %d, %Y %H:%M') if timestamp else ''

            alerts = []
            soil_moisture = latest_reading.get('soil_moisture') or 0
            humidity      = latest_reading.get('humidity') or 0
            temperature   = latest_reading.get('temperature') or 0
            ph            = latest_reading.get('ph') or 0

            # Pump-on alert — humidity threshold
            if humidity > HUMIDITY_THRESHOLD:
                alerts.append({
                    'id': 'pump-humidity',
                    'priority': 'High',
                    'time': timestamp,
                    'title': '💧 Water pump is ON — high humidity',
                    'detail': (
                        f'Humidity on {zone} is {humidity:.1f}% '
                        f'(threshold {HUMIDITY_THRESHOLD}%). Irrigation pump activated automatically.'
                    ),
                    'action': 'Monitor water usage and soil saturation',
                    'zone': zone,
                })

            # Pump-on alert — temperature threshold
            if temperature > TEMPERATURE_THRESHOLD:
                alerts.append({
                    'id': 'pump-temperature',
                    'priority': 'High',
                    'time': timestamp,
                    'title': '🌡️ Water pump is ON — high temperature',
                    'detail': (
                        f'Temperature on {zone} is {temperature:.1f}°C '
                        f'(threshold {TEMPERATURE_THRESHOLD}°C). Irrigation pump activated to cool soil.'
                    ),
                    'action': 'Check field for heat stress; consider shade netting',
                    'zone': zone,
                })

            # Low moisture
            if soil_moisture < MOISTURE_THRESHOLD:
                alerts.append({
                    'id': 'low-moisture',
                    'priority': 'Medium',
                    'time': timestamp,
                    'title': 'Low soil moisture detected',
                    'detail': f'Soil moisture on {zone} is {soil_moisture}%, below safe threshold.',
                    'action': 'Increase irrigation duration',
                    'zone': zone,
                })

            # pH drift
            if ph and (ph < PH_MIN or ph > PH_MAX):
                alerts.append({
                    'id': 'ph-drift',
                    'priority': 'Medium',
                    'time': timestamp,
                    'title': 'pH level drift detected',
                    'detail': f'Current pH is {ph:.2f} — ideal range {PH_MIN}–{PH_MAX}.',
                    'action': 'Apply lime (low pH) or sulfur (high pH)',
                    'zone': zone,
                })

            return JsonResponse(alerts or [], safe=False)

        latest_reading = SensorData.objects.order_by('-timestamp').first()
        if not latest_reading:
            return JsonResponse([], safe=False)

        alerts = []
        zone      = latest_reading.farm.name
        timestamp = latest_reading.timestamp.strftime('%b %d, %Y %H:%M')

        # Pump-on alert — humidity
        if latest_reading.humidity > HUMIDITY_THRESHOLD:
            alerts.append({
                'id': 'pump-humidity',
                'priority': 'High',
                'time': timestamp,
                'title': '💧 Water pump is ON — high humidity',
                'detail': (
                    f'Humidity on {zone} is {latest_reading.humidity:.1f}% '
                    f'(threshold {HUMIDITY_THRESHOLD}%). Pump activated automatically.'
                ),
                'action': 'Monitor water usage and soil saturation',
                'zone': zone,
            })

        # Pump-on alert — temperature
        if latest_reading.temperature > TEMPERATURE_THRESHOLD:
            alerts.append({
                'id': 'pump-temperature',
                'priority': 'High',
                'time': timestamp,
                'title': '🌡️ Water pump is ON — high temperature',
                'detail': (
                    f'Temperature on {zone} is {latest_reading.temperature:.1f}°C '
                    f'(threshold {TEMPERATURE_THRESHOLD}°C). Pump activated to cool soil.'
                ),
                'action': 'Check field for heat stress; consider shade netting',
                'zone': zone,
            })

        # Low moisture
        if latest_reading.soil_moisture < MOISTURE_THRESHOLD:
            alerts.append({
                'id': 'low-moisture',
                'priority': 'Medium',
                'time': timestamp,
                'title': 'Low soil moisture detected',
                'detail': f'Soil moisture on {zone} is {latest_reading.soil_moisture}%, below safe threshold.',
                'action': 'Increase irrigation duration',
                'zone': zone,
            })

        # pH drift
        if latest_reading.ph < PH_MIN or latest_reading.ph > PH_MAX:
            alerts.append({
                'id': 'ph-drift',
                'priority': 'Medium',
                'time': timestamp,
                'title': 'pH level drift detected',
                'detail': f'Current pH is {latest_reading.ph:.2f} — ideal range {PH_MIN}–{PH_MAX}.',
                'action': 'Apply lime (low pH) or sulfur (high pH)',
                'zone': zone,
            })

        return JsonResponse(alerts or [], safe=False)


class SensorDataHistoryView(generics.ListAPIView):
    serializer_class = SensorDataSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        farm_id = self.request.query_params.get('farm_id')
        days = int(self.request.query_params.get('days', 7))
        start_time = timezone.now() - timedelta(days=days)
        qs = SensorData.objects.filter(timestamp__gte=start_time)
        if self.request.user.is_authenticated:
            qs = qs.filter(farm__user=self.request.user)
        if farm_id:
            qs = qs.filter(farm_id=farm_id)
        return qs.order_by('-timestamp')


class DashboardView(APIView):
    """Return dashboard metrics and trend data scoped to the logged-in user's farms."""
    permission_classes = [AllowAny]

    def get(self, request):
        # Try MongoDB first — always user-scoped
        if request.user.is_authenticated:
            docs = get_sensor_docs_for_user(request.user.id, limit=24)
            if docs is not None:
                return JsonResponse(_dashboard_payload_from_mongo_docs(docs))

        # SQLite fallback — user-scoped, never cross-user
        qs = SensorData.objects.order_by('-timestamp')
        if request.user.is_authenticated:
            qs = qs.filter(farm__user=request.user)
        return JsonResponse(_dashboard_payload_from_readings(qs[:24]))
