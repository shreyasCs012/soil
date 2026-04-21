from rest_framework import serializers

from .models import Farm, SensorData


class FarmSerializer(serializers.ModelSerializer):
    class Meta:
        model = Farm
        fields = ['id', 'name', 'location', 'area_acres', 'created_at']
        read_only_fields = ['id', 'created_at']


class SensorDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorData
        fields = [
            'id',
            'farm',
            'soil_moisture',
            'temperature',
            'humidity',
            'nitrogen',
            'phosphorus',
            'potassium',
            'timestamp',
        ]
        read_only_fields = ['id', 'timestamp']

    def validate_farm(self, farm):
        request = self.context['request']
        if farm.user_id != request.user.id:
            raise serializers.ValidationError('You can only submit data for your own farm.')
        return farm
