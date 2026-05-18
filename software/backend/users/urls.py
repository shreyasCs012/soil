from django.urls import path

from .views import MeView, UserRegisterView

urlpatterns = [
    path('register/', UserRegisterView.as_view(), name='user-register'),
    path('me/', MeView.as_view(), name='user-me'),
]
