from django.db import models

from sensors.models import Farm


class CropRecommendation(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='crop_recommendations')
    recommended_crop = models.CharField(max_length=100)
    confidence_score = models.FloatField(default=0.5)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.recommended_crop} ({self.farm.name})'


class PesticideRecommendation(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='pesticide_recommendations')
    crop_name = models.CharField(max_length=100)
    condition = models.CharField(max_length=160)
    pesticide_name = models.CharField(max_length=120)
    dosage = models.CharField(max_length=120, blank=True)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.pesticide_name} for {self.crop_name}'
