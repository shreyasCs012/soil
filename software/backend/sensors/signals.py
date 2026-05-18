"""
Auto-seed realistic sensor data whenever a new Farm is created.

Each farm gets 24 hourly readings over the last 24 hours so the dashboard,
trend chart, and AI panels have real data to show immediately after registration.
The baseline values are deterministically varied by farm.id so every farm
looks distinct.
"""
import random
from datetime import timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Farm, SensorData

_HOURS = 24       # readings to seed
_INTERVAL = 60    # minutes between each reading


def _seeded_rng(farm_id: int) -> random.Random:
    """Return a Random instance seeded from the farm id so baselines differ per farm."""
    return random.Random(farm_id * 7919)   # 7919 is prime — good spread


def seed_sensor_data_for_farm(farm: Farm) -> None:
    """Create _HOURS synthetic sensor readings for *farm*."""
    rng = _seeded_rng(farm.pk)

    # Per-farm baseline (stays stable across the 24 readings)
    base_ph          = rng.uniform(6.0, 7.2)
    base_nitrogen    = rng.uniform(28, 52)
    base_phosphorus  = rng.uniform(18, 42)
    base_potassium   = rng.uniform(32, 62)
    base_moisture    = rng.uniform(38, 68)
    base_temperature = rng.uniform(24, 34)
    base_humidity    = rng.uniform(55, 82)

    now = timezone.now()
    readings = []
    for hour in range(_HOURS, 0, -1):
        ts = now - timedelta(minutes=hour * _INTERVAL)
        readings.append(
            SensorData(
                farm=farm,
                timestamp=ts,
                ph=round(base_ph + rng.uniform(-0.15, 0.15), 2),
                nitrogen=round(base_nitrogen + rng.uniform(-3, 3), 1),
                phosphorus=round(base_phosphorus + rng.uniform(-2, 2), 1),
                potassium=round(base_potassium + rng.uniform(-3, 3), 1),
                soil_moisture=round(base_moisture + rng.uniform(-4, 4), 1),
                temperature=round(base_temperature + rng.uniform(-1.5, 1.5), 1),
                humidity=round(base_humidity + rng.uniform(-3, 3), 1),
            )
        )

    SensorData.objects.bulk_create(readings)


@receiver(post_save, sender=Farm)
def on_farm_created(sender, instance: Farm, created: bool, **kwargs):
    """Seed sensor data whenever a brand-new Farm row is inserted."""
    if created and not instance.sensor_readings.exists():
        seed_sensor_data_for_farm(instance)
