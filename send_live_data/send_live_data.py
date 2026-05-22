
import serial
import requests
print("Script Started")
# Bluetooth COM Port
bluetooth = serial.Serial('COM6', 9600)
print("Bluetooth Connected")
# Your teammate backend URL
url = "http://YOUR_TEAMMATE_IP:8000/api/sensor/"

while True:

    raw_data = bluetooth.readline().decode().strip()

    print(raw_data)

    try:

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

        print("Sent")

    except Exception as e:

        print(e)