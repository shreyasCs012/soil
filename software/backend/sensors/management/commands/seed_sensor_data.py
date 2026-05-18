"""
management command: seed_sensor_data

Creates realistic sensor readings for every farm and mirrors everything
(existing + new) to MongoDB.

Usage:
    python manage.py seed_sensor_data            # seed empty farms, mirror all to Mongo
    python manage.py seed_sensor_data --reseed   # wipe + reseed every farm, re-mirror all
"""
import random
from datetime import datetime, timedelta, timezone

from django.core.management.base import BaseCommand
from django.utils import timezone as dj_tz

from sensors.models import Farm, SensorData
from core.mongodb import save_sensor_reading, get_db

# Crop-specific baseline profiles  ─────────────────────────────────────────
# (ph_base, nitrogen, phosphorus, potassium, moisture, temperature, humidity)
_CROP_PROFILES: dict[str, tuple] = {
    "rice":                    (6.4, 48, 32, 28, 70, 30, 82),
    "paddy (rice)":            (6.4, 48, 32, 28, 70, 30, 82),
    "wheat":                   (6.8, 42, 30, 38, 48, 22, 60),
    "maize":                   (6.6, 50, 28, 42, 52, 28, 65),
    "cotton":                  (7.0, 35, 22, 35, 45, 32, 58),
    "sugarcane":               (6.5, 55, 35, 50, 68, 29, 76),
    "arhar (pigeon pea)":      (6.5, 30, 25, 32, 44, 28, 62),
    "arhar":                   (6.5, 30, 25, 32, 44, 28, 62),
    "groundnut":               (6.2, 28, 38, 30, 46, 30, 60),
    "soybean":                 (6.7, 38, 32, 40, 50, 26, 65),
    "potato":                  (5.8, 45, 42, 55, 62, 20, 72),
    "tomato":                  (6.3, 42, 38, 48, 58, 24, 68),
    "onion":                   (6.0, 36, 34, 36, 52, 22, 60),
    "banana":                  (6.2, 46, 36, 55, 65, 28, 78),
    "mixed vegetables & pulses": (6.5, 38, 30, 36, 52, 26, 65),
    "default":                 (6.8, 38, 28, 38, 50, 27, 65),
}


def _profile_for(crop: str) -> tuple:
    return _CROP_PROFILES.get(crop.strip().lower(), _CROP_PROFILES["default"])


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _seed_farm(farm: Farm, hours: int, rng: random.Random) -> list[SensorData]:
    """Generate `hours` hourly readings for *farm* and bulk-insert into SQLite."""
    ph, n, p, k, moist, temp, hum = _profile_for(farm.crop_type)

    readings = []
    now = datetime.now(timezone.utc)
    for h in range(hours, 0, -1):
        ts = now - timedelta(hours=h)
        # Add gentle trend + noise
        drift = h / hours          # 0→1 as we go backwards in time
        readings.append(SensorData(
            farm=farm,
            timestamp=ts,
            ph=            round(_clamp(ph   + rng.uniform(-0.18, 0.18) + drift * rng.uniform(-0.05, 0.05), 5.0, 8.5), 2),
            nitrogen=      round(_clamp(n    + rng.uniform(-4, 4),   5, 120), 1),
            phosphorus=    round(_clamp(p    + rng.uniform(-3, 3),   5,  80), 1),
            potassium=     round(_clamp(k    + rng.uniform(-4, 4),   5, 100), 1),
            soil_moisture= round(_clamp(moist+ rng.uniform(-5, 5),  10,  95), 1),
            temperature=   round(_clamp(temp + rng.uniform(-2, 2),  10,  45), 1),
            humidity=      round(_clamp(hum  + rng.uniform(-4, 4),  20,  98), 1),
        ))

    SensorData.objects.bulk_create(readings)
    return readings


def _mirror_to_mongo(readings: list[SensorData]) -> int:
    """Bulk-insert a list of SensorData ORM objects into MongoDB sensor_data."""
    db = get_db()
    if db is None:
        return 0

    docs = []
    for r in readings:
        docs.append({
            "farm_id":       r.farm_id,
            "user_id":       r.farm.user_id,
            "soil_moisture": r.soil_moisture,
            "temperature":   r.temperature,
            "humidity":      r.humidity,
            "ph":            r.ph,
            "nitrogen":      r.nitrogen,
            "phosphorus":    r.phosphorus,
            "potassium":     r.potassium,
            "timestamp":     r.timestamp,
        })

    if docs:
        db.sensor_data.insert_many(docs)
    return len(docs)


class Command(BaseCommand):
    help = "Seed dummy sensor data for every farm and mirror to MongoDB."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reseed", action="store_true",
            help="Wipe existing readings first, then re-seed everything.",
        )
        parser.add_argument(
            "--hours", type=int, default=48,
            help="Number of hourly readings to generate per farm (default 48).",
        )

    def handle(self, *args, **options):
        reseed  = options["reseed"]
        hours   = options["hours"]
        farms   = list(Farm.objects.select_related("user").all())

        if not farms:
            self.stdout.write(self.style.WARNING("No farms found."))
            return

        total_sqlite = 0
        total_mongo  = 0

        for farm in farms:
            rng = random.Random(farm.pk * 31337)

            if reseed:
                deleted, _ = SensorData.objects.filter(farm=farm).delete()
                if deleted:
                    self.stdout.write(f"  Cleared {deleted} old readings for {farm.name!r}")

            existing = SensorData.objects.filter(farm=farm).count()

            if existing == 0:
                new_readings = _seed_farm(farm, hours, rng)
                total_sqlite += len(new_readings)
                self.stdout.write(
                    f"  [SEEDED] {farm.name!r} ({farm.user.username}) "
                    f"crop={farm.crop_type!r} — {len(new_readings)} readings"
                )
            else:
                self.stdout.write(
                    f"  [SKIP]   {farm.name!r} already has {existing} readings in SQLite"
                )

        # Mirror EVERYTHING from SQLite -> MongoDB (replace all Mongo sensor_data)
        self.stdout.write("\nMirroring all SQLite sensor data to MongoDB...")
        db = get_db()
        if db is not None:
            db.sensor_data.drop()   # clear stale docs

        all_readings = list(
            SensorData.objects
            .select_related("farm")
            .order_by("timestamp")
        )
        total_mongo = _mirror_to_mongo(all_readings)

        self.stdout.write(self.style.SUCCESS(
            f"\nDone. SQLite: seeded {total_sqlite} new rows | "
            f"MongoDB: mirrored {total_mongo} total docs"
        ))
