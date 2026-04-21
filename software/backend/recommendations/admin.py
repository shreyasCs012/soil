from django.contrib import admin

from .models import CropRecommendation, PesticideRecommendation

admin.site.register(CropRecommendation)
admin.site.register(PesticideRecommendation)
