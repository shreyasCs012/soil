from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from .models import FarmerProfile
from sensors.models import Farm
from core.mongodb import save_user, save_farm


class FarmerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmerProfile
        fields = ['farmer_name', 'phone', 'address', 'bio']


class FarmBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Farm
        fields = ['id', 'name', 'location', 'address', 'area_acres', 'crop_type', 'soil_type', 'created_at']


class UserRegisterSerializer(serializers.Serializer):
    username    = serializers.CharField(max_length=150)
    email       = serializers.EmailField()
    password    = serializers.CharField(write_only=True, min_length=8)
    farmer_name = serializers.CharField(max_length=120)
    phone       = serializers.CharField(max_length=20, default='', allow_blank=True)
    address     = serializers.CharField(default='', allow_blank=True)
    farm_name   = serializers.CharField(max_length=120, default='My Farm')
    farm_location  = serializers.CharField(max_length=255, default='', allow_blank=True)
    farm_address   = serializers.CharField(default='', allow_blank=True)
    farm_area      = serializers.DecimalField(max_digits=7, decimal_places=2, required=False, allow_null=True)
    crop_type   = serializers.CharField(max_length=120, default='', allow_blank=True)
    soil_type   = serializers.CharField(max_length=120, default='', allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        # 1. Create Django user + profile + farm (SQLite)
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )
        FarmerProfile.objects.create(
            user=user,
            farmer_name=validated_data['farmer_name'],
            phone=validated_data.get('phone', ''),
            address=validated_data.get('address', ''),
        )
        farm = Farm.objects.create(
            user=user,
            name=validated_data.get('farm_name', 'My Farm'),
            location=validated_data.get('farm_location', ''),
            address=validated_data.get('farm_address', ''),
            area_acres=validated_data.get('farm_area'),
            crop_type=validated_data.get('crop_type', ''),
            soil_type=validated_data.get('soil_type', ''),
        )

        # 2. Mirror to MongoDB (best-effort — never fail registration if Mongo is down)
        save_user(user.id, {
            'username':    user.username,
            'email':       user.email,
            'farmer_name': validated_data['farmer_name'],
            'phone':       validated_data.get('phone', ''),
            'address':     validated_data.get('address', ''),
        })
        save_farm(farm.id, {
            'django_user_id': user.id,
            'name':      farm.name,
            'location':  farm.location,
            'address':   farm.address,
            'area_acres': float(farm.area_acres) if farm.area_acres else None,
            'crop_type': farm.crop_type,
            'soil_type': farm.soil_type,
        })

        return user


class MeSerializer(serializers.ModelSerializer):
    farmer_name     = serializers.SerializerMethodField()
    phone           = serializers.SerializerMethodField()
    profile_address = serializers.SerializerMethodField()
    farms           = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'farmer_name', 'phone', 'profile_address', 'farms']

    def get_farmer_name(self, obj):
        profile = getattr(obj, 'profile', None)
        return profile.farmer_name if profile else obj.get_full_name() or obj.username

    def get_phone(self, obj):
        profile = getattr(obj, 'profile', None)
        return profile.phone if profile else ''

    def get_profile_address(self, obj):
        profile = getattr(obj, 'profile', None)
        return profile.address if profile else ''

    def get_farms(self, obj):
        return FarmBriefSerializer(obj.farms.all(), many=True).data
