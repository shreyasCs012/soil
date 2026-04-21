from django.contrib import admin

from .models import Farm, SensorData

admin.site.register(Farm)
admin.site.register(SensorData)
