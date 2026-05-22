from django.contrib import admin
from django.urls import path
from django.http import JsonResponse
import json

def sensor_data(request):

    if request.method == "POST":

        body = json.loads(request.body)

        print(body)

        return JsonResponse({
            "message": "Data received",
            "data": body
        })

    return JsonResponse({
        "message": "API Working"
    })

urlpatterns = [

    path('admin/', admin.site.urls),

    path('api/', sensor_data),
]
