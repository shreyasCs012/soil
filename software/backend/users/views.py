from rest_framework import generics, permissions

from .serializers import UserRegisterSerializer


class UserRegisterView(generics.CreateAPIView):
    serializer_class = UserRegisterSerializer
    permission_classes = [permissions.AllowAny]
