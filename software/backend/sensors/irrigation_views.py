import json
from datetime import datetime, timezone

import requests
from django.conf import settings
from django.http import JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
import pymongo

from sensors.models import Farm, SensorData


def _get_mongo_db():
    mongo_uri = getattr(settings, 'MONGODB_URI', None)
    mongo_name = getattr(settings, 'MONGODB_NAME', None)
    if not mongo_uri or not mongo_name:
        return None
    client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
    return client[mongo_name]


def _detect_trend(values):
    """Compare mean of oldest half vs newest half to detect direction."""
    if len(values) < 3:
        return 'stable'
    mid = len(values) // 2
    older = values[:mid]
    newer = values[mid:]
    older_mean = sum(older) / len(older)
    newer_mean = sum(newer) / len(newer)
    delta = newer_mean - older_mean
    threshold = max(abs(older_mean) * 0.05, 0.5)
    if delta > threshold:
        return 'rising'
    if delta < -threshold:
        return 'falling'
    return 'stable'


def _parse_llm_json(content: str) -> dict:
    content = content.strip()
    if content.startswith('```'):
        content = content.strip('`').strip()
        if content.startswith('json'):
            content = content[4:].strip()
    return json.loads(content)


class CompartmentsView(APIView):
    """GET/POST fertilizer compartments stored per farm in MongoDB."""
    permission_classes = [AllowAny]

    def _collection(self):
        db = _get_mongo_db()
        return db.get_collection('irrigation_compartments') if db is not None else None

    def _default_compartments(self):
        return [
            {'slot': 'A', 'name': '', 'type': 'nitrogen',     'n_pct': 0, 'p_pct': 0, 'k_pct': 0, 'ph_effect': 'neutral'},
            {'slot': 'B', 'name': '', 'type': 'phosphorus',   'n_pct': 0, 'p_pct': 0, 'k_pct': 0, 'ph_effect': 'neutral'},
            {'slot': 'C', 'name': '', 'type': 'potassium',    'n_pct': 0, 'p_pct': 0, 'k_pct': 0, 'ph_effect': 'neutral'},
            {'slot': 'D', 'name': '', 'type': 'ph_corrector', 'n_pct': 0, 'p_pct': 0, 'k_pct': 0, 'ph_effect': 'neutral'},
        ]

    def get(self, request):
        user = request.user
        farm = Farm.objects.filter(user=user).first() if user.is_authenticated else None

        col = self._collection()
        if col is not None and farm:
            try:
                doc = col.find_one({'farm_id': farm.id})
                if doc:
                    return JsonResponse({'compartments': doc.get('compartments', []), 'farm_id': farm.id})
            except pymongo.errors.PyMongoError:
                pass

        return JsonResponse({'compartments': self._default_compartments(), 'farm_id': farm.id if farm else None})

    def post(self, request):
        user = request.user
        if not user.is_authenticated:
            return JsonResponse({'detail': 'Authentication required.'}, status=401)

        farm = Farm.objects.filter(user=user).first()
        if not farm:
            return JsonResponse({'detail': 'No farm found.'}, status=404)

        compartments = request.data.get('compartments', [])

        col = self._collection()
        if col is not None:
            try:
                col.update_one(
                    {'farm_id': farm.id},
                    {'$set': {
                        'farm_id': farm.id,
                        'user_id': user.id,
                        'compartments': compartments,
                        'updated_at': datetime.now(timezone.utc),
                    }},
                    upsert=True,
                )
            except pymongo.errors.PyMongoError:
                pass

        return JsonResponse({'status': 'saved', 'compartments': compartments})


class ComputeMixView(APIView):
    """POST — AI computes the optimal fertigation mix from sensor data + compartments."""
    permission_classes = [AllowAny]

    def post(self, request):
        user = request.user
        farm_id = request.data.get('farm_id')
        compartments = request.data.get('compartments', [])

        qs = SensorData.objects.order_by('-timestamp')
        if user.is_authenticated:
            qs = qs.filter(farm__user=user)
        if farm_id:
            qs = qs.filter(farm_id=farm_id)
        history = list(qs[:10])

        if not history:
            return JsonResponse({'detail': 'No sensor data found.'}, status=404)

        latest = history[0]
        farm = Farm.objects.filter(user=user).first() if user.is_authenticated else None
        crop = (farm.crop_type or 'general') if farm else 'general'

        history_dicts = [
            {
                'ph': float(r.ph), 'nitrogen': float(r.nitrogen),
                'phosphorus': float(r.phosphorus), 'potassium': float(r.potassium),
                'soil_moisture': float(r.soil_moisture),
                'timestamp': r.timestamp.isoformat(),
            }
            for r in reversed(history)
        ]

        # Rule-based fallback
        doses = []
        reasons = []
        for c in compartments:
            if not c.get('name'):
                continue
            amount = 0.0
            reason = ''
            ctype = c.get('type', '')

            if ctype == 'nitrogen' and float(latest.nitrogen) < 30 and c.get('n_pct', 0) > 0:
                deficit = 30 - float(latest.nitrogen)
                amount = round(deficit * 100 / max(c['n_pct'], 1), 1)
                reason = f'N at {latest.nitrogen:.1f} ppm (target 30)'

            elif ctype == 'phosphorus' and float(latest.phosphorus) < 20 and c.get('p_pct', 0) > 0:
                deficit = 20 - float(latest.phosphorus)
                amount = round(deficit * 100 / max(c['p_pct'], 1), 1)
                reason = f'P at {latest.phosphorus:.1f} ppm (target 20)'

            elif ctype == 'potassium' and float(latest.potassium) < 20 and c.get('k_pct', 0) > 0:
                deficit = 20 - float(latest.potassium)
                amount = round(deficit * 100 / max(c['k_pct'], 1), 1)
                reason = f'K at {latest.potassium:.1f} ppm (target 20)'

            elif ctype == 'ph_corrector':
                ph_val = float(latest.ph)
                if ph_val < 6.2 and c.get('ph_effect') == 'raise':
                    amount = round((6.5 - ph_val) * 10, 1)
                    reason = f'pH {ph_val:.2f} → target 6.5 (add lime)'
                elif ph_val > 7.4 and c.get('ph_effect') == 'lower':
                    amount = round((ph_val - 7.0) * 10, 1)
                    reason = f'pH {ph_val:.2f} → target 7.0 (add acidifier)'

            if amount > 0:
                doses.append({'slot': c['slot'], 'name': c['name'], 'amount_g': amount, 'reason': reason})
                reasons.append(reason)

        water_litres = 30 if float(latest.soil_moisture) < 40 else 20
        duration_minutes = 20 if float(latest.soil_moisture) < 40 else 15
        summary = f"Fertigation for {crop}: " + (', '.join(reasons) if reasons else 'soil levels within normal range')
        urgency = 'warning' if reasons else 'info'

        # LLM enhancement
        if settings.LLM_API_KEY and compartments:
            payload = {
                'model': settings.LLM_MODEL,
                'messages': [
                    {
                        'role': 'system',
                        'content': (
                            'You are a precision agriculture AI specializing in fertigation (fertilizer + irrigation). '
                            'Given current soil sensor readings, target crop, and available fertilizer compartments '
                            '(each with slot label, name, NPK percentages, and pH effect), compute exact fertigation '
                            'doses to correct deficiencies and reach optimal soil conditions. '
                            'Return ONLY valid JSON: water_litres (int 5-50), duration_minutes (int 5-30), '
                            'doses (array of {slot, name, amount_g (float), reason (string)}), '
                            'summary (string under 200 chars), urgency (good/info/warning/critical).'
                        ),
                    },
                    {
                        'role': 'user',
                        'content': json.dumps({
                            'crop': crop,
                            'current_sensor': {
                                'ph': float(latest.ph), 'nitrogen': float(latest.nitrogen),
                                'phosphorus': float(latest.phosphorus), 'potassium': float(latest.potassium),
                                'soil_moisture': float(latest.soil_moisture),
                            },
                            'sensor_history': history_dicts,
                            'compartments': compartments,
                            'target_ranges': {
                                'ph': [6.2, 7.4], 'nitrogen_ppm': [30, 60],
                                'phosphorus_ppm': [20, 40], 'potassium_ppm': [20, 40], 'moisture_pct': [40, 65],
                            },
                        }),
                    },
                ],
                'temperature': 0.15,
                'max_tokens': 500,
                'response_format': {'type': 'json_object'},
            }
            try:
                resp = requests.post(
                    f'{settings.LLM_API_BASE_URL}/chat/completions',
                    headers={'Authorization': f'Bearer {settings.LLM_API_KEY}', 'Content-Type': 'application/json'},
                    json=payload, timeout=20,
                )
                resp.raise_for_status()
                data = _parse_llm_json(resp.json()['choices'][0]['message']['content'])
                water_litres = max(5, min(50, int(data.get('water_litres', water_litres))))
                duration_minutes = max(5, min(30, int(data.get('duration_minutes', duration_minutes))))
                llm_doses = data.get('doses', [])
                if isinstance(llm_doses, list) and llm_doses:
                    doses = llm_doses
                summary = str(data.get('summary', summary))[:300]
                u = str(data.get('urgency', urgency)).lower()
                if u in {'good', 'info', 'warning', 'critical'}:
                    urgency = u
            except Exception:
                pass

        return JsonResponse({
            'water_litres': water_litres,
            'duration_minutes': duration_minutes,
            'doses': doses,
            'summary': summary,
            'urgency': urgency,
        })


class TrendAlertsView(APIView):
    """GET — analyze historical sensor trends and return irrigation-relevant alerts."""
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        farm_id = request.query_params.get('farm_id')

        qs = SensorData.objects.order_by('-timestamp')
        if user.is_authenticated:
            qs = qs.filter(farm__user=user)
        if farm_id:
            qs = qs.filter(farm_id=farm_id)
        readings = list(qs[:10])

        if len(readings) < 2:
            return JsonResponse([], safe=False)

        readings_asc = list(reversed(readings))
        latest = readings[0]
        timestamp = latest.timestamp.strftime('%b %d, %Y %H:%M')

        ph_vals       = [float(r.ph) for r in readings_asc]
        n_vals        = [float(r.nitrogen) for r in readings_asc]
        p_vals        = [float(r.phosphorus) for r in readings_asc]
        k_vals        = [float(r.potassium) for r in readings_asc]
        moisture_vals = [float(r.soil_moisture) for r in readings_asc]

        ph_trend  = _detect_trend(ph_vals)
        n_trend   = _detect_trend(n_vals)
        p_trend   = _detect_trend(p_vals)
        k_trend   = _detect_trend(k_vals)
        m_trend   = _detect_trend(moisture_vals)

        n = len(readings)
        alerts = []

        if ph_trend == 'falling' and float(latest.ph) < 6.8:
            alerts.append({
                'id': 'ph-falling-trend',
                'priority': 'High',
                'time': timestamp,
                'title': 'pH falling — lime buffer needed',
                'detail': f'pH dropped from {ph_vals[0]:.2f} to {ph_vals[-1]:.2f} over last {n} readings. Approaching acidic threshold (6.2).',
                'action': 'Apply pH-up solution or lime during next fertigation',
                'parameter': 'ph', 'trend': 'falling', 'requires_irrigation': True,
                'current_value': float(latest.ph),
            })
        elif ph_trend == 'rising' and float(latest.ph) > 7.0:
            alerts.append({
                'id': 'ph-rising-trend',
                'priority': 'Medium',
                'time': timestamp,
                'title': 'pH rising — nutrient lockout risk',
                'detail': f'pH climbed from {ph_vals[0]:.2f} to {ph_vals[-1]:.2f}. Above 7.5 causes iron and manganese lockout.',
                'action': 'Apply pH-down (dilute acid or sulfur) during fertigation',
                'parameter': 'ph', 'trend': 'rising', 'requires_irrigation': True,
                'current_value': float(latest.ph),
            })

        if n_trend == 'falling' and float(latest.nitrogen) < 35:
            alerts.append({
                'id': 'nitrogen-falling-trend',
                'priority': 'High',
                'time': timestamp,
                'title': 'Nitrogen declining — crop growth at risk',
                'detail': f'N dropped from {n_vals[0]:.1f} to {n_vals[-1]:.1f} ppm over {n} readings. Below 25 ppm stunts growth.',
                'action': 'Apply nitrogen-rich fertigation (urea or DAP)',
                'parameter': 'nitrogen', 'trend': 'falling', 'requires_irrigation': True,
                'current_value': float(latest.nitrogen),
            })

        if p_trend == 'falling' and float(latest.phosphorus) < 25:
            alerts.append({
                'id': 'phosphorus-falling-trend',
                'priority': 'Medium',
                'time': timestamp,
                'title': 'Phosphorus declining — root health at risk',
                'detail': f'P dropped from {p_vals[0]:.1f} to {p_vals[-1]:.1f} ppm. Critical for root development and flowering.',
                'action': 'Apply phosphorus fertigation (SSP or DAP)',
                'parameter': 'phosphorus', 'trend': 'falling', 'requires_irrigation': True,
                'current_value': float(latest.phosphorus),
            })

        if k_trend == 'falling' and float(latest.potassium) < 25:
            alerts.append({
                'id': 'potassium-falling-trend',
                'priority': 'Medium',
                'time': timestamp,
                'title': 'Potassium declining — stress tolerance dropping',
                'detail': f'K dropped from {k_vals[0]:.1f} to {k_vals[-1]:.1f} ppm. Plants will show wilting and poor water movement.',
                'action': 'Apply potassium fertigation (MOP or SOP)',
                'parameter': 'potassium', 'trend': 'falling', 'requires_irrigation': True,
                'current_value': float(latest.potassium),
            })

        if m_trend == 'falling' and float(latest.soil_moisture) < 45:
            alerts.append({
                'id': 'moisture-falling-trend',
                'priority': 'High' if float(latest.soil_moisture) < 35 else 'Medium',
                'time': timestamp,
                'title': 'Soil moisture declining — irrigation needed',
                'detail': f'Moisture fell from {moisture_vals[0]:.1f}% to {moisture_vals[-1]:.1f}%. Critical threshold is 35%.',
                'action': 'Start irrigation cycle immediately',
                'parameter': 'moisture', 'trend': 'falling', 'requires_irrigation': True,
                'current_value': float(latest.soil_moisture),
            })

        return JsonResponse(alerts, safe=False)


class TriggerIrrigationView(APIView):
    """POST — store a confirmed irrigation command in MongoDB for the hardware bridge."""

    def post(self, request):
        user = request.user
        if not user.is_authenticated:
            return JsonResponse({'detail': 'Authentication required.'}, status=401)

        farm = Farm.objects.filter(user=user).first()
        if not farm:
            return JsonResponse({'detail': 'No farm found.'}, status=404)

        water_litres     = int(request.data.get('water_litres', 20))
        duration_minutes = int(request.data.get('duration_minutes', 15))
        doses            = request.data.get('doses', [])
        summary          = str(request.data.get('summary', ''))[:300]

        doses_dict = {d['slot']: float(d.get('amount_g', 0)) for d in doses if isinstance(d, dict)}

        command = {
            'farm_id':          farm.id,
            'user_id':          user.id,
            'status':           'pending',
            'water_litres':     water_litres,
            'duration_minutes': duration_minutes,
            'doses':            doses_dict,
            'doses_detail':     doses,
            'summary':          summary,
            'triggered_at':     datetime.now(timezone.utc),
            'executed_at':      None,
        }

        db = _get_mongo_db()
        cmd_id = None
        if db is not None:
            try:
                result = db.irrigation_commands.insert_one(command)
                cmd_id = str(result.inserted_id)
            except pymongo.errors.PyMongoError:
                pass

        return JsonResponse({
            'status':     'queued',
            'command_id': cmd_id,
            'message':    (
                f'Irrigation queued: {water_litres} L over {duration_minutes} min'
                + (f' with {len(doses)} fertilizer dose(s).' if doses else '.')
            ),
        })
