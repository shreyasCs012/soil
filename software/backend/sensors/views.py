from datetime import timedelta

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


def _metric_status(key, value):
    if value is None:
        return 'normal'
    if key == 'moisture' and value < 35:
        return 'low'
    if key == 'moisture' and value > 65:
        return 'warning'
    if key == 'ph' and (value < 6.2 or value > 7.4):
        return 'warning'
    if key in {'nitrogen', 'phosphorus', 'potassium'} and value < 25:
        return 'low'
    return 'normal'


def _dashboard_payload_from_readings(readings):
    readings = list(readings)
    if not readings:
        return {'metrics': [], 'trend': []}

    latest = readings[0]
    metric_specs = [
        ('moisture', 'Soil Moisture', latest.soil_moisture, '%', 'Tracks irrigation need from the latest sensor reading.'),
        ('ph', 'pH Level', latest.ph, 'pH', 'Ideal soil range is usually near 6.2 to 7.4.'),
        ('nitrogen', 'Nitrogen', latest.nitrogen, 'ppm', 'Supports green growth and crop vigor.'),
        ('phosphorus', 'Phosphorus', latest.phosphorus, 'ppm', 'Supports roots, flowering, and early crop growth.'),
        ('potassium', 'Potassium', latest.potassium, 'ppm', 'Supports stress tolerance and water movement.'),
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

    trend = [
        {
            'time': reading.timestamp.isoformat(),
            'moisture': reading.soil_moisture,
            'ph': reading.ph,
            'nitrogen': reading.nitrogen,
            'phosphorus': reading.phosphorus,
            'potassium': reading.potassium,
        }
        for reading in reversed(readings)
    ]

    return {'metrics': metrics, 'trend': trend}


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
        ('moisture', 'Soil Moisture', latest.get('soil_moisture'), '%', 'Tracks irrigation need from the latest sensor reading.'),
        ('ph', 'pH Level', latest.get('ph'), 'pH', 'Ideal soil range is usually near 6.2 to 7.4.'),
        ('nitrogen', 'Nitrogen', latest.get('nitrogen'), 'ppm', 'Supports green growth and crop vigor.'),
        ('phosphorus', 'Phosphorus', latest.get('phosphorus'), 'ppm', 'Supports roots, flowering, and early crop growth.'),
        ('potassium', 'Potassium', latest.get('potassium'), 'ppm', 'Supports stress tolerance and water movement.'),
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
    trend = [
        {
            'time': doc.get('timestamp').isoformat() if doc.get('timestamp') else None,
            'moisture': doc.get('soil_moisture'),
            'ph': doc.get('ph'),
            'nitrogen': doc.get('nitrogen'),
            'phosphorus': doc.get('phosphorus'),
            'potassium': doc.get('potassium'),
        }
        for doc in reversed(docs)
    ]

    return {'metrics': metrics, 'trend': trend}


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
            ph = latest_reading.get('ph') or 0
            nitrogen = latest_reading.get('nitrogen') or 0

            if soil_moisture < 35:
                alerts.append({
                    'id': 'low-moisture',
                    'priority': 'High',
                    'time': timestamp,
                    'title': 'Low soil moisture detected',
                    'detail': f'Soil moisture on {zone} is {soil_moisture}%, below the safe threshold.',
                    'action': 'Increase irrigation',
                    'zone': zone,
                })

            if ph < 6.2 or ph > 7.4:
                alerts.append({
                    'id': 'ph-drift',
                    'priority': 'Medium',
                    'time': timestamp,
                    'title': 'pH level drift detected',
                    'detail': f'Current pH is {ph:.2f}, which is outside ideal range.',
                    'action': 'Check nutrient balance',
                    'zone': zone,
                })

            if nitrogen < 25:
                alerts.append({
                    'id': 'low-nitrogen',
                    'priority': 'Low',
                    'time': timestamp,
                    'title': 'Nitrogen levels are low',
                    'detail': f'Nitrogen is at {nitrogen} ppm for {zone}.',
                    'action': 'Apply nitrogen-rich fertilizer',
                    'zone': zone,
                })

            return JsonResponse(alerts or [], safe=False)

        latest_reading = SensorData.objects.order_by('-timestamp').first()
        if not latest_reading:
            return JsonResponse([], safe=False)

        alerts = []
        zone = latest_reading.farm.name
        timestamp = latest_reading.timestamp.strftime('%b %d, %Y %H:%M')

        if latest_reading.soil_moisture < 35:
            alerts.append({
                'id': 'low-moisture',
                'priority': 'High',
                'time': timestamp,
                'title': 'Low soil moisture detected',
                'detail': f'Soil moisture on {zone} is {latest_reading.soil_moisture}%, below the safe threshold.',
                'action': 'Increase irrigation',
                'zone': zone,
            })

        if latest_reading.ph < 6.2 or latest_reading.ph > 7.4:
            alerts.append({
                'id': 'ph-drift',
                'priority': 'Medium',
                'time': timestamp,
                'title': 'pH level drift detected',
                'detail': f'Current pH is {latest_reading.ph:.2f}, which is outside ideal range.',
                'action': 'Check nutrient balance',
                'zone': zone,
            })

        if latest_reading.nitrogen < 25:
            alerts.append({
                'id': 'low-nitrogen',
                'priority': 'Low',
                'time': timestamp,
                'title': 'Nitrogen levels are low',
                'detail': f'Nitrogen is at {latest_reading.nitrogen} ppm for {zone}.',
                'action': 'Apply nitrogen-rich fertilizer',
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
