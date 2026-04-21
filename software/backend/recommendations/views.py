from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

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


class CropRecommendationView(APIView):
    def get(self, request):
        farm_id = request.query_params.get('farm_id')
        if not farm_id:
            return Response({'detail': 'farm_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        latest_reading = SensorData.objects.filter(farm_id=farm_id, farm__user=request.user).order_by('-timestamp').first()
        if not latest_reading:
            return Response({'detail': 'No sensor data found for this farm.'}, status=status.HTTP_404_NOT_FOUND)

        crop, confidence, reason = _rule_based_crop(latest_reading)
        crop, confidence = _ml_boost(latest_reading, crop, confidence)
        recommendation = CropRecommendation.objects.create(
            farm=latest_reading.farm,
            recommended_crop=crop,
            confidence_score=confidence,
            reason=reason,
        )
        return Response(CropRecommendationSerializer(recommendation).data)


class PesticideRecommendationView(APIView):
    def get(self, request):
        farm_id = request.query_params.get('farm_id')
        crop = request.query_params.get('crop')
        if not farm_id or not crop:
            return Response(
                {'detail': 'farm_id and crop query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        latest_reading = SensorData.objects.filter(farm_id=farm_id, farm__user=request.user).order_by('-timestamp').first()
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

        recommendation = PesticideRecommendation.objects.create(
            farm=latest_reading.farm,
            crop_name=crop,
            condition=condition,
            pesticide_name=pesticide_name,
            dosage=dosage,
            reason=f'Generated from latest humidity {latest_reading.humidity} and temperature {latest_reading.temperature}.',
        )
        return Response(PesticideRecommendationSerializer(recommendation).data)
