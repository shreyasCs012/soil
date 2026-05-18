from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import MeSerializer, UserRegisterSerializer


class UserRegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegisterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({'detail': 'Account created successfully.'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        profile = getattr(request.user, 'profile', None)
        if profile is None:
            return Response({'detail': 'Profile not found.'}, status=status.HTTP_404_NOT_FOUND)
        for field in ('farmer_name', 'phone', 'address', 'bio'):
            if field in request.data:
                setattr(profile, field, request.data[field])
        profile.save()
        return Response(MeSerializer(request.user).data)
