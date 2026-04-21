from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from recommendations.models import CropRecommendation, PesticideRecommendation
from sensors.models import Farm, SensorData


class Command(BaseCommand):
    help = 'Seed sample users, farms, sensor readings, and recommendations'

    def handle(self, *args, **options):
        user, _ = User.objects.get_or_create(
            username='farmer1',
            defaults={'email': 'farmer1@example.com'},
        )
        user.set_password('password123')
        user.save()

        farm, _ = Farm.objects.get_or_create(
            user=user,
            name='North Plot',
            defaults={'location': 'Ludhiana', 'area_acres': 4.5},
        )

        reading = SensorData.objects.create(
            farm=farm,
            soil_moisture=62.3,
            temperature=29.1,
            humidity=71.2,
            nitrogen=43.0,
            phosphorus=21.8,
            potassium=25.1,
        )

        CropRecommendation.objects.create(
            farm=farm,
            recommended_crop='Rice',
            confidence_score=0.84,
            reason='Sample recommendation generated for seed data.',
        )
        PesticideRecommendation.objects.create(
            farm=farm,
            crop_name='Rice',
            condition='High humidity fungal risk',
            pesticide_name='Copper Oxychloride',
            dosage='2g/L water',
            reason='Sample pesticide recommendation generated for seed data.',
        )

        self.stdout.write(self.style.SUCCESS(f'Seed data created. Latest reading id: {reading.id}'))
