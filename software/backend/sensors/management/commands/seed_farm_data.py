"""
Management command: seed sensor data for any farm that has no readings.

Usage:
    python manage.py seed_farm_data          # seed all empty farms
    python manage.py seed_farm_data --all    # re-seed every farm (clears existing)
"""
from django.core.management.base import BaseCommand

from sensors.models import Farm
from sensors.signals import seed_sensor_data_for_farm


class Command(BaseCommand):
    help = "Seed sensor data for farms that have no readings."

    def add_arguments(self, parser):
        parser.add_argument(
            '--all',
            action='store_true',
            help='Re-seed every farm, clearing existing sensor data first.',
        )

    def handle(self, *args, **options):
        reseed_all = options['all']
        farms = Farm.objects.all()
        seeded = 0

        for farm in farms:
            if reseed_all:
                farm.sensor_readings.all().delete()

            if not farm.sensor_readings.exists():
                seed_sensor_data_for_farm(farm)
                seeded += 1
                self.stdout.write(f"  [OK] Seeded {farm.name} (user: {farm.user.username})")

        if seeded:
            self.stdout.write(self.style.SUCCESS(f"\nSeeded {seeded} farm(s)."))
        else:
            self.stdout.write("All farms already have sensor data. Use --all to force re-seed.")
