from django.urls import path

from .views import CropRecommendationView, PesticideRecommendationView

urlpatterns = [
    path('recommend/crop/', CropRecommendationView.as_view(), name='recommend-crop'),
    path('recommend/pesticide/', PesticideRecommendationView.as_view(), name='recommend-pesticide'),
]
