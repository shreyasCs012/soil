"""
MongoDB connection pool and write helpers.

All writes go through this module so the rest of the codebase never
imports pymongo directly for writes.  Reads that live in views.py still
use their own pymongo calls for historical reasons; this module is the
single authoritative place for *inserts/upserts*.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pymongo
from django.conf import settings

logger = logging.getLogger(__name__)

_client: pymongo.MongoClient | None = None


def _get_client() -> pymongo.MongoClient | None:
    """Return a cached MongoClient, or None if MongoDB is not configured."""
    global _client
    uri = getattr(settings, "MONGODB_URI", "").strip()
    name = getattr(settings, "MONGODB_NAME", "").strip()
    if not uri or not name:
        return None
    if _client is None:
        _client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=5000)
    return _client


def get_db() -> pymongo.database.Database | None:
    """Return the configured MongoDB database, or None if unconfigured."""
    client = _get_client()
    if client is None:
        return None
    return client[settings.MONGODB_NAME]


# ── Write helpers ────────────────────────────────────────────────────────────

def save_user(django_user_id: int, data: dict[str, Any]) -> None:
    """Upsert a user document into the `users` collection."""
    db = get_db()
    if db is None:
        return
    try:
        db.users.update_one(
            {"django_user_id": django_user_id},
            {"$set": {
                "django_user_id": django_user_id,
                "username":       data.get("username", ""),
                "email":          data.get("email", ""),
                "farmer_name":    data.get("farmer_name", ""),
                "phone":          data.get("phone", ""),
                "address":        data.get("address", ""),
                "updated_at":     datetime.now(timezone.utc),
            }, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except pymongo.errors.PyMongoError as exc:
        logger.warning("MongoDB save_user failed: %s", exc)


def save_farm(django_farm_id: int, data: dict[str, Any]) -> None:
    """Upsert a farm document into the `farms` collection."""
    db = get_db()
    if db is None:
        return
    try:
        db.farms.update_one(
            {"django_farm_id": django_farm_id},
            {"$set": {
                "django_farm_id": django_farm_id,
                "django_user_id": data.get("django_user_id"),
                "name":           data.get("name", ""),
                "location":       data.get("location", ""),
                "address":        data.get("address", ""),
                "area_acres":     data.get("area_acres"),
                "crop_type":      data.get("crop_type", ""),
                "soil_type":      data.get("soil_type", ""),
                "latitude":       data.get("latitude"),
                "longitude":      data.get("longitude"),
                "updated_at":     datetime.now(timezone.utc),
            }, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except pymongo.errors.PyMongoError as exc:
        logger.warning("MongoDB save_farm failed: %s", exc)


def save_sensor_reading(django_farm_id: int, django_user_id: int, data: dict[str, Any]) -> None:
    """Insert one sensor reading into the `sensor_data` collection."""
    db = get_db()
    if db is None:
        return
    try:
        db.sensor_data.insert_one({
            "farm_id":       django_farm_id,
            "user_id":       django_user_id,
            "soil_moisture": data.get("soil_moisture"),
            "temperature":   data.get("temperature"),
            "humidity":      data.get("humidity"),
            "ph":            data.get("ph"),
            "nitrogen":      data.get("nitrogen"),
            "phosphorus":    data.get("phosphorus"),
            "potassium":     data.get("potassium"),
            "timestamp":     data.get("timestamp") or datetime.now(timezone.utc),
        })
    except pymongo.errors.PyMongoError as exc:
        logger.warning("MongoDB save_sensor_reading failed: %s", exc)


def get_sensor_docs_for_user(django_user_id: int, farm_id: int | None = None,
                              limit: int = 24) -> list[dict] | None:
    """
    Return sensor docs scoped to a user's farms.
    Returns None when MongoDB is unavailable so callers can fall back to SQLite.
    """
    db = get_db()
    if db is None:
        return None
    try:
        query: dict[str, Any] = {"user_id": django_user_id}
        if farm_id is not None:
            query["farm_id"] = farm_id
        docs = list(db.sensor_data.find(query).sort("timestamp", -1).limit(limit))
        return docs
    except pymongo.errors.PyMongoError as exc:
        logger.warning("MongoDB get_sensor_docs_for_user failed: %s", exc)
        return None
