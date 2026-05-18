import json

import requests
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
import pymongo
from bson import ObjectId
from django.conf import settings

from sensors.models import SensorData

from .models import CropRecommendation, PesticideRecommendation
from .serializers import CropRecommendationSerializer, PesticideRecommendationSerializer


def _rule_based_crop(reading: SensorData) -> tuple[str, float, str]:
    if reading.soil_moisture > 65 and reading.humidity > 65:
        return 'Rice', 0.82, 'High moisture and humidity are suitable for rice.'
    if reading.temperature > 28 and reading.nitrogen > 45:
        return 'Maize', 0.78, 'Warm climate and high nitrogen are favorable for maize.'
    if reading.soil_moisture < 40 and reading.potassium > 30:
        return 'Millet', 0.74, 'Lower moisture with sufficient potassium fits millet.'
    return 'Wheat', 0.7, 'Balanced conditions are generally suitable for wheat.'


def _ml_boost(reading: SensorData, default_crop: str, confidence: float) -> tuple[str, float]:
    try:
        from sklearn.tree import DecisionTreeClassifier
    except ImportError:
        return default_crop, confidence

    # Tiny local model as optional drop-in for richer logic.
    X_train = [
        [70, 28, 75, 40, 22, 18],
        [45, 33, 52, 55, 30, 26],
        [32, 31, 42, 38, 18, 40],
        [50, 22, 55, 35, 20, 20],
    ]
    y_train = ['Rice', 'Maize', 'Millet', 'Wheat']
    model = DecisionTreeClassifier(max_depth=3, random_state=42)
    model.fit(X_train, y_train)
    pred = model.predict(
        [[reading.soil_moisture, reading.temperature, reading.humidity, reading.nitrogen, reading.phosphorus, reading.potassium]]
    )[0]
    boosted_confidence = min(confidence + 0.08, 0.95) if pred != default_crop else min(confidence + 0.04, 0.95)
    return pred, boosted_confidence


def _reading_context(reading: SensorData) -> dict:
    return {
        'soil_moisture': reading.soil_moisture,
        'temperature': reading.temperature,
        'humidity': reading.humidity,
        'ph': reading.ph,
        'nitrogen': reading.nitrogen,
        'phosphorus': reading.phosphorus,
        'potassium': reading.potassium,
    }


def _parse_llm_json(content: str) -> dict:
    content = content.strip()
    if content.startswith('```'):
        content = content.strip('`').strip()
        if content.startswith('json'):
            content = content[4:].strip()
    return json.loads(content)


def _llm_crop_recommendation(
    reading: SensorData,
    fallback_crop: str,
    fallback_confidence: float,
    fallback_reason: str,
) -> tuple[str, float, str]:
    if not settings.LLM_API_KEY:
        return fallback_crop, fallback_confidence, fallback_reason

    payload = {
        'model': settings.LLM_MODEL,
        'messages': [
            {
                'role': 'system',
                'content': (
                    'You are an agronomy assistant for soil-health decisions. '
                    'Return only valid JSON with keys: recommended_crop, '
                    'confidence_score, reason, fertilizer_recommendation. '
                    'confidence_score must be a number between 0 and 1. '
                    'Keep reason and fertilizer_recommendation practical and concise.'
                ),
            },
            {
                'role': 'user',
                'content': json.dumps(
                    {
                        'latest_sensor_reading': _reading_context(reading),
                        'baseline_recommendation': {
                            'recommended_crop': fallback_crop,
                            'confidence_score': fallback_confidence,
                            'reason': fallback_reason,
                        },
                    }
                ),
            },
        ],
        'temperature': 0.2,
        'max_tokens': 350,
        'response_format': {'type': 'json_object'},
    }

    try:
        response = requests.post(
            f'{settings.LLM_API_BASE_URL}/chat/completions',
            headers={
                'Authorization': f'Bearer {settings.LLM_API_KEY}',
                'Content-Type': 'application/json',
            },
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content']
        data = _parse_llm_json(content)
    except (KeyError, TypeError, ValueError, requests.RequestException):
        return fallback_crop, fallback_confidence, fallback_reason

    crop = str(data.get('recommended_crop') or fallback_crop).strip()[:100]
    reason = str(data.get('reason') or fallback_reason).strip()
    fertilizer = str(data.get('fertilizer_recommendation') or '').strip()

    try:
        confidence = float(data.get('confidence_score', fallback_confidence))
    except (TypeError, ValueError):
        confidence = fallback_confidence
    confidence = max(0.0, min(confidence, 0.99))

    if fertilizer:
        reason = f'{reason} Fertilization: {fertilizer}'

    return crop or fallback_crop, confidence, reason or fallback_reason


class SensorReadingSnapshot:
    def __init__(self, doc):
        self.farm = None
        self.soil_moisture = doc.get('soil_moisture')
        self.temperature = doc.get('temperature')
        self.humidity = doc.get('humidity')
        self.ph = doc.get('ph')
        self.nitrogen = doc.get('nitrogen')
        self.phosphorus = doc.get('phosphorus')
        self.potassium = doc.get('potassium')


def _get_mongo_latest_reading(farm_id):
    mongo_uri = getattr(settings, 'MONGODB_URI', None)
    mongo_name = getattr(settings, 'MONGODB_NAME', None)

    if not mongo_uri or not mongo_name:
        return None

    possible_ids = [farm_id]
    try:
        possible_ids.append(ObjectId(farm_id))
    except Exception:
        pass

    client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
    collection = client[mongo_name].get_collection('sensor_data')
    doc = collection.find_one({'farm_id': {'$in': possible_ids}}, sort=[('timestamp', -1)])
    if not doc:
        doc = collection.find_one({'_id': {'$in': possible_ids}}, sort=[('timestamp', -1)])
    return SensorReadingSnapshot(doc) if doc else None


class CropRecommendationView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        farm_id = request.query_params.get('farm_id')
        if not farm_id:
            return Response({'detail': 'farm_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            latest_reading = _get_mongo_latest_reading(farm_id)
        except pymongo.errors.PyMongoError:
            latest_reading = None

        if latest_reading is None:
            readings = SensorData.objects.filter(farm_id=farm_id)
            if request.user.is_authenticated:
                readings = readings.filter(farm__user=request.user)
            latest_reading = readings.order_by('-timestamp').first()

        if not latest_reading:
            return Response({'detail': 'No sensor data found for this farm.'}, status=status.HTTP_404_NOT_FOUND)

        crop, confidence, reason = _rule_based_crop(latest_reading)
        crop, confidence = _ml_boost(latest_reading, crop, confidence)
        crop, confidence, reason = _llm_crop_recommendation(
            latest_reading,
            crop,
            confidence,
            reason,
        )
        if latest_reading.farm:
            recommendation = CropRecommendation.objects.create(
                farm=latest_reading.farm,
                recommended_crop=crop,
                confidence_score=confidence,
                reason=reason,
            )
            return Response(CropRecommendationSerializer(recommendation).data)

        return Response({
            'id': None,
            'farm': farm_id,
            'recommended_crop': crop,
            'confidence_score': confidence,
            'reason': reason,
            'created_at': None,
        })


class PesticideRecommendationView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        farm_id = request.query_params.get('farm_id')
        crop = request.query_params.get('crop')
        if not farm_id or not crop:
            return Response(
                {'detail': 'farm_id and crop query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            latest_reading = _get_mongo_latest_reading(farm_id)
        except pymongo.errors.PyMongoError:
            latest_reading = None

        if latest_reading is None:
            readings = SensorData.objects.filter(farm_id=farm_id)
            if request.user.is_authenticated:
                readings = readings.filter(farm__user=request.user)
            latest_reading = readings.order_by('-timestamp').first()

        if not latest_reading:
            return Response({'detail': 'No sensor data found for this farm.'}, status=status.HTTP_404_NOT_FOUND)

        if latest_reading.humidity > 75:
            pesticide_name = 'Copper Oxychloride'
            condition = 'High humidity fungal risk'
            dosage = '2g/L water'
        elif latest_reading.temperature > 33:
            pesticide_name = 'Neem Oil Spray'
            condition = 'Heat-driven pest activity'
            dosage = '3ml/L water'
        else:
            pesticide_name = 'Imidacloprid'
            condition = 'General pest prevention'
            dosage = '0.5ml/L water'

        if latest_reading.farm:
            recommendation = PesticideRecommendation.objects.create(
                farm=latest_reading.farm,
                crop_name=crop,
                condition=condition,
                pesticide_name=pesticide_name,
                dosage=dosage,
                reason=f'Generated from latest humidity {latest_reading.humidity} and temperature {latest_reading.temperature}.',
            )
            return Response(PesticideRecommendationSerializer(recommendation).data)

        return Response({
            'id': None,
            'farm': farm_id,
            'crop_name': crop,
            'condition': condition,
            'pesticide_name': pesticide_name,
            'dosage': dosage,
            'reason': f'Generated from latest humidity {latest_reading.humidity} and temperature {latest_reading.temperature}.',
            'created_at': None,
        })
