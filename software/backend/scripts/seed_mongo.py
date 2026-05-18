import os
from pathlib import Path
from datetime import datetime, timedelta

from dotenv import load_dotenv
from pymongo import MongoClient


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

MONGODB_URI = os.getenv('MONGODB_URI')
MONGODB_NAME = os.getenv('MONGODB_NAME', 'soildb')

if not MONGODB_URI:
    raise RuntimeError('MONGODB_URI is not set in .env')

client = MongoClient(MONGODB_URI)
db = client[MONGODB_NAME]

def seed():
    sensor_coll = db.get_collection('sensor_data')
    farm_coll = db.get_collection('farms')

    # Insert a demo farm
    farm = {
        'name': 'Demo Farm',
        'location': 'Demo Location',
        'area_acres': 5.0,
        'created_at': datetime.utcnow(),
    }
    farm_id = farm_coll.insert_one(farm).inserted_id

    # Insert several sensor readings (timestamps descending)
    now = datetime.utcnow()
    readings = [
        {
            'farm_id': farm_id,
            'soil_moisture': 44 - i * 3,
            'ph': 6.7 - i * 0.05,
            'temperature': 29 - i * 0.5,
            'humidity': 62 - i * 1.5,
            'nitrogen': 55 - i * 3,
            'phosphorus': 51 + i * 1,
            'potassium': 46 - i * 2,
            'timestamp': now - timedelta(hours=(5 - i) * 2),
        }
        for i in range(6)
    ]

    sensor_coll.insert_many(readings)

    print(f'Inserted demo farm {farm_id} and {len(readings)} sensor readings into {MONGODB_NAME}')


if __name__ == '__main__':
    seed()
