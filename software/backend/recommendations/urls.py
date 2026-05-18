from django.urls import path

from .views import (
    CropRecommendationView,
    CropSoilRecommendationView,
    PesticideRecommendationView,
    SoilPredictionView,
)

urlpatterns = [
    path('recommend/crop/', CropRecommendationView.as_view(), name='recommend-crop'),
    path('recommend/pesticide/', PesticideRecommendationView.as_view(), name='recommend-pesticide'),
    path('recommend/soil-for-crop/', CropSoilRecommendationView.as_view(), name='recommend-soil-for-crop'),
    path('predict/soil/', SoilPredictionView.as_view(), name='predict-soil'),
]
