from django.conf import settings
from django.db import models


class Farm(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='farms')
    name = models.CharField(max_length=120)
    location = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    area_acres = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    crop_type = models.CharField(max_length=120, blank=True)
    soil_type = models.CharField(max_length=120, blank=True)
    latitude  = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'{self.name} ({self.user.username})'


class SensorData(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='sensor_readings')
    soil_moisture = models.FloatField()
    temperature = models.FloatField()
    humidity = models.FloatField()
    ph = models.FloatField(default=6.8)
    nitrogen = models.FloatField()
    phosphorus = models.FloatField()
    potassium = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self) -> str:
        return f'Reading for {self.farm.name} at {self.timestamp.isoformat()}'
