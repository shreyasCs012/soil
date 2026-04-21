from rest_framework import serializers

from .models import CropRecommendation, PesticideRecommendation


class CropRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CropRecommendation
        fields = ['id', 'farm', 'recommended_crop', 'confidence_score', 'reason', 'created_at']
        read_only_fields = ['id', 'created_at']


class PesticideRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PesticideRecommendation
        fields = [
            'id',
            'farm',
            'crop_name',
            'condition',
            'pesticide_name',
            'dosage',
            'reason',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
