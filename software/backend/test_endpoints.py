#!/usr/bin/env python
import requests
import json

BASE_URL = "http://127.0.0.1:8000"

endpoints = [
    ("POST", "/api/auth/register/", "User Registration"),
    ("POST", "/api/auth/token/", "JWT Token"),
    ("POST", "/api/auth/token/refresh/", "Token Refresh"),
    ("GET", "/api/farms/", "Farm List/Create"),
    ("POST", "/api/sensor-data/", "Create Sensor Data"),
    ("GET", "/api/sensor-data/latest/", "Latest Sensor Data"),
    ("GET", "/api/sensor-data/history/", "Sensor Data History"),
    ("POST", "/api/recommend/crop/", "Crop Recommendation"),
    ("POST", "/api/recommend/pesticide/", "Pesticide Recommendation"),
    ("GET", "/api/weather/", "Weather"),
]

print("=" * 100)
print("SOIL HEALTH API ENDPOINT TEST RESULTS")
print("=" * 100)
print()

results = []

for method, endpoint, name in endpoints:
    try:
        url = BASE_URL + endpoint
        if method == "GET":
            resp = requests.get(url, timeout=3)
        else:
            resp = requests.post(url, json={}, timeout=3)
        
        status_ok = resp.status_code < 500
        status_text = "OK" if status_ok else "ERROR"
        results.append((method, endpoint, name, resp.status_code, status_text))
        
    except requests.exceptions.ConnectionError as e:
        results.append((method, endpoint, name, 0, "CONNECTION_FAILED"))
    except Exception as e:
        results.append((method, endpoint, name, 0, f"ERROR"))

for method, endpoint, name, code, status in results:
    print(f"  {method:6} {endpoint:35} | {name:30} | Status: {code:3} ({status})")

print()
print("=" * 100)
print()

# Detailed endpoint information
endpoint_info = {
    "POST /api/auth/register/": {
        "use": "Register a new user account",
        "required_fields": ["username", "email", "password"],
        "expected_status": 201
    },
    "POST /api/auth/token/": {
        "use": "Obtain JWT access and refresh tokens",
        "required_fields": ["username", "password"],
        "expected_status": 200
    },
    "POST /api/auth/token/refresh/": {
        "use": "Refresh expired JWT access token",
        "required_fields": ["refresh"],
        "expected_status": 200
    },
    "GET /api/farms/": {
        "use": "List all farms or create new farm",
        "required_fields": [],
        "expected_status": 200
    },
    "POST /api/sensor-data/": {
        "use": "Create new sensor data entry",
        "required_fields": ["farm", "temperature", "humidity", "ph_level"],
        "expected_status": 201
    },
    "GET /api/sensor-data/latest/": {
        "use": "Get the latest sensor reading",
        "required_fields": [],
        "expected_status": 200
    },
    "GET /api/sensor-data/history/": {
        "use": "Get historical sensor data",
        "required_fields": [],
        "expected_status": 200
    },
    "POST /api/recommend/crop/": {
        "use": "Get crop recommendations based on soil parameters",
        "required_fields": ["temperature", "humidity", "ph"],
        "expected_status": 200
    },
    "POST /api/recommend/pesticide/": {
        "use": "Get pesticide recommendations for crop and soil",
        "required_fields": ["crop_type", "soil_type"],
        "expected_status": 200
    },
    "GET /api/weather/": {
        "use": "Get weather data for a location",
        "required_fields": ["latitude", "longitude"],
        "expected_status": 200
    }
}

print("DETAILED ENDPOINT INFORMATION")
print("=" * 100)
print()

for method, endpoint, name, code, status in results:
    full_endpoint = f"{method} {endpoint}"
    info = endpoint_info.get(full_endpoint, {})
    
    print(f"Endpoint: {full_endpoint}")
    print(f"  Name: {name}")
    print(f"  Use: {info.get('use', 'N/A')}")
    print(f"  Required Fields: {', '.join(info.get('required_fields', ['N/A']))}")
    print(f"  Expected Status: {info.get('expected_status', 'N/A')}")
    print(f"  Actual Status: {code} ({status})")
    print()

print("=" * 100)
