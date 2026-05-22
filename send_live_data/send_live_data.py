import serial
import requests
import json

# Arduino COM Port
arduino = serial.Serial('COM5', 9600)

# Backend URL
url = "http://127.0.0.1:8000/api/"

print("Reading Arduino Data...")

while True:

    try:

        raw_data = arduino.readline().decode().strip()

        print("Received:", raw_data)

        # Example:
        # Soil:500 Temp:30 Humidity:58

        parts = raw_data.split()

        soil = int(parts[0].split(":")[1])

        temp = float(parts[1].split(":")[1])

        humidity = float(parts[2].split(":")[1])

        data = {

            "soil": soil,

            "temperature": temp,

            "humidity": humidity
        }

        response = requests.post(url, json=data)

        print("Sent:", response.status_code)

    except Exception as e:

        print("Error:", e)
