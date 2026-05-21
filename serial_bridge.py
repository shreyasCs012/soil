#!/usr/bin/env python3
"""
Arduino serial ↔ MongoDB Atlas bridge.

Reads JSON sensor lines from the Arduino and stores them in MongoDB.
Also polls MongoDB for pending irrigation commands and sends them to the
Arduino as JSON so the firmware can actuate pumps and dosing motors.

Setup:
    pip install -r requirements_bridge.txt

Usage:
    python serial_bridge.py --port COM3 --farm-id 1 --user-id 1

Find your COM port:
    Windows: Device Manager → Ports (COM & LPT)
    Linux:   ls /dev/ttyUSB* or /dev/ttyACM*

Arduino command format sent over serial:
    {"cmd":"irrigate","water_l":20,"minutes":15,"dose_A":25,"dose_B":10,"dose_C":0,"dose_D":5}
"""

import argparse
import json
import os
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import serial
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from bson import ObjectId

# Load credentials from software/backend/.env
ENV_PATH = Path(__file__).parent / "software" / "backend" / ".env"
if not ENV_PATH.exists():
    print(f"ERROR: .env not found at {ENV_PATH}", file=sys.stderr)
    sys.exit(1)
load_dotenv(ENV_PATH)

MONGODB_URI  = os.getenv("MONGODB_URI", "").strip()
MONGODB_NAME = os.getenv("MONGODB_NAME", "soildb").strip()


def connect_mongo():
    if not MONGODB_URI:
        print("ERROR: MONGODB_URI is empty in .env", file=sys.stderr)
        sys.exit(1)
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=8000)
    client.admin.command("ping")
    print(f"Connected to MongoDB Atlas  db={MONGODB_NAME}")
    return client[MONGODB_NAME]


def parse_line(line: str) -> dict | None:
    """Return a parsed dict if line is valid JSON, otherwise None."""
    line = line.strip()
    if not line.startswith("{"):
        return None
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def poll_irrigation_commands(db, farm_id: int, ser: serial.Serial, stop_event: threading.Event):
    """
    Background thread: every 5 s check MongoDB for a pending irrigation command
    for this farm, send it to the Arduino as JSON, then mark it executed.
    """
    commands = db.irrigation_commands

    while not stop_event.is_set():
        try:
            cmd = commands.find_one({"farm_id": farm_id, "status": "pending"})
            if cmd:
                doses = cmd.get("doses", {})
                arduino_cmd = {
                    "cmd":     "irrigate",
                    "water_l": cmd.get("water_litres", 20),
                    "minutes": cmd.get("duration_minutes", 15),
                    "dose_A":  doses.get("A", 0),
                    "dose_B":  doses.get("B", 0),
                    "dose_C":  doses.get("C", 0),
                    "dose_D":  doses.get("D", 0),
                }
                line = json.dumps(arduino_cmd) + "\n"
                ser.write(line.encode("utf-8"))
                print(f"\n[irrigation] → Arduino: {line.strip()}")

                commands.update_one(
                    {"_id": cmd["_id"]},
                    {"$set": {"status": "executed", "executed_at": datetime.now(timezone.utc)}},
                )
                print(f"[irrigation] Command {cmd['_id']} marked executed.")
        except PyMongoError as exc:
            print(f"[irrigation] MongoDB error: {exc}", file=sys.stderr)
        except serial.SerialException as exc:
            print(f"[irrigation] Serial error sending command: {exc}", file=sys.stderr)

        stop_event.wait(5)


def main():
    parser = argparse.ArgumentParser(description="Arduino ↔ MongoDB Atlas bridge")
    parser.add_argument("--port",    default="COM3",  help="Serial port, e.g. COM3 or /dev/ttyUSB0")
    parser.add_argument("--baud",    type=int, default=9600)
    parser.add_argument("--farm-id", type=int, default=1, help="Farm ID to tag every reading with")
    parser.add_argument("--user-id", type=int, default=1, help="User ID to tag every reading with")
    args = parser.parse_args()

    db         = connect_mongo()
    collection = db.sensor_data

    print(f"Opening {args.port} at {args.baud} baud …")
    try:
        ser = serial.Serial(args.port, args.baud, timeout=5)
    except serial.SerialException as exc:
        print(f"ERROR: Cannot open {args.port}: {exc}", file=sys.stderr)
        sys.exit(1)

    # Start background thread for irrigation command polling
    stop_event = threading.Event()
    cmd_thread = threading.Thread(
        target=poll_irrigation_commands,
        args=(db, args.farm_id, ser, stop_event),
        daemon=True,
        name="irrigation-cmd-poller",
    )
    cmd_thread.start()
    print("Irrigation command poller started (polls every 5 s).")
    print("Listening for sensor data. Press Ctrl+C to stop.\n")

    try:
        while True:
            raw  = ser.readline().decode("utf-8", errors="ignore")
            data = parse_line(raw)
            if data is None:
                # Pass-through non-JSON lines (e.g. "System ready") to terminal
                stripped = raw.strip()
                if stripped:
                    print(f"[arduino] {stripped}")
                continue

            doc = {
                "farm_id":       args.farm_id,
                "user_id":       args.user_id,
                "soil_moisture": data.get("soil_moisture"),
                "temperature":   data.get("temperature"),
                "humidity":      data.get("humidity"),
                "ph":            data.get("ph"),
                "pump_on":       data.get("pump_on", False),
                # Arduino has no N/P/K sensor — stored as null
                "nitrogen":      None,
                "phosphorus":    None,
                "potassium":     None,
                "timestamp":     datetime.now(timezone.utc),
            }

            try:
                result = collection.insert_one(doc)
                ts = doc["timestamp"].strftime("%H:%M:%S")
                print(
                    f"[{ts}] ✓ {result.inserted_id} | "
                    f"Moisture={doc['soil_moisture']:.1f}%  "
                    f"Temp={doc['temperature']:.1f}°C  "
                    f"Humidity={doc['humidity']:.1f}%  "
                    f"pH={doc['ph']:.2f}  "
                    f"Pump={'ON' if doc['pump_on'] else 'OFF'}"
                )
            except PyMongoError as exc:
                print(f"[mongo] insert failed: {exc}", file=sys.stderr)

    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        stop_event.set()
        ser.close()


if __name__ == "__main__":
    main()
