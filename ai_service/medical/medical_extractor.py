import json
import os
from openai import OpenAI
#from django.conf import settings
from medical.symptom_ontology import (
    normalize_symptoms
)
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

def safe_json_parse(content):
    """
    Safely parse LLM JSON.
    """

    try:
        return json.loads(content)

    except Exception:

        # Remove markdown
        content = (
            content
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        # Try extracting JSON block
        start = content.find("{")
        end = content.rfind("}")

        if start != -1 and end != -1:
            content = content[start:end+1]

        try:
            return json.loads(content)

        except Exception:
            return None

def extract_medical_features(symptoms_text):
    """
    Convert messy patient symptoms
    into structured medical features.
    """

    prompt = f"""
You are a medical symptom extraction engine.

Your task is NOT diagnosis.

Only extract structured medical information.

Patient symptoms:
{symptoms_text}

Return STRICT JSON only.

Format:

{{
    "primary_symptoms": [],
    "secondary_symptoms": [],

    "body_regions": [],

    "severity": "",

    "duration": {{
        "value": 0,
        "unit": ""
    }},

    "symptom_pattern": {{
        "onset": "",
        "frequency": "",
        "progression": ""
    }},

    "trigger_factors": [],
    "relief_factors": [],

    "risk_flags": [],
    "red_flags": [],
    "risk_factors": [],
    "negative_symptoms": [],

    "possible_emergency": False
}}

Rules:
- Do not diagnose.
- Extract only structured findings.
- Detect explicitly denied symptoms.

Example:
"I have chest pain but no fever"

Then:
primary_symptoms = ["chest pain"]
negative_symptoms = ["fever"]

- Never place denied symptoms in primary_symptoms.
- If duration unknown return:
  {"value":0,"unit":"unknown"}
- severity ∈ mild, moderate, severe
- onset ∈ sudden, gradual
- progression ∈ improving, worsening, stable
- frequency ∈ constant, intermittent
- possible_emergency=true ONLY for dangerous symptoms
- Return valid JSON only.
"""

    try:
        response = client.chat.completions.create(
            model="gpt-5.4-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You extract medical features."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1
        )

        content = (
            response.choices[0]
            .message.content
            .strip()
        )

        # Remove accidental markdown
        content = content.replace(
            "```json",
            ""
        ).replace(
            "```",
            ""
        ).strip()

        extracted = safe_json_parse(
            content
        )

        if not extracted:
            raise Exception(
                "Invalid extractor JSON"
            )
        # Normalize symptoms
        extracted[
            "primary_symptoms"
        ] = normalize_symptoms(
            extracted.get(
                "primary_symptoms",
                []
            )
        )

        extracted[
            "secondary_symptoms"
        ] = normalize_symptoms(
            extracted.get(
                "secondary_symptoms",
                []
            )
        )

        extracted[
            "risk_flags"
        ] = normalize_symptoms(
            extracted.get(
                "risk_flags",
                []
            )
        )

        extracted[
            "red_flags"
        ] = normalize_symptoms(
            extracted.get(
                "red_flags",
                []
            )
        )

        extracted[
            "negative_symptoms"
        ] = normalize_symptoms(
            extracted.get(
                "negative_symptoms",
                []
            )
        )

        extracted[
            "trigger_factors"
        ] = normalize_symptoms(
            extracted.get(
                "trigger_factors",
                []
            )
        )

        extracted[
            "relief_factors"
        ] = normalize_symptoms(
            extracted.get(
                "relief_factors",
                []
            )
        )

        # -------------------------
        # Duration cleanup
        # -------------------------

        duration = extracted.get(
            "duration",
            {}
        )

        try:
            duration_value = int(
                duration.get(
                    "value",
                    0
                )
            )
        except:
            duration_value = 0

        duration_unit = str(
            duration.get(
                "unit",
                "unknown"
            )
        ).lower()

        valid_units = [
            "hours",
            "days",
            "weeks",
            "months",
            "years",
            "unknown"
        ]

        if duration_unit not in valid_units:
            duration_unit = "unknown"

        extracted["duration"] = {
            "value": duration_value,
            "unit": duration_unit
        }

        # -------------------------
        # Safety defaults
        # -------------------------

        defaults = {
            "primary_symptoms": [],
            "secondary_symptoms": [],
            "body_regions": [],
            "severity": "",

            "duration": {
                "value": 0,
                "unit": "unknown"
            },

            "symptom_pattern": {
                "onset": "",
                "frequency": "",
                "progression": ""
            },

            "trigger_factors": [],
            "relief_factors": [],

            "risk_flags": [],
            "red_flags": [],
            "risk_factors": [],
            "negative_symptoms": [],

            "possible_emergency": False,
        }

        for key, value in defaults.items():

            if key not in extracted:
                extracted[key] = value

        return extracted

    except Exception as e:
        print("❌ Medical extractor failed:", e)

        return {
            "primary_symptoms": [],
            "secondary_symptoms": [],
            "body_regions": [],
            "severity": "",

            "duration": {
                "value": 0,
                "unit": "unknown"
            },

            "symptom_pattern": {
                "onset": "",
                "frequency": "",
                "progression": ""
            },

            "trigger_factors": [],
            "relief_factors": [],

            "risk_flags": [],
            "red_flags": [],
            "risk_factors": [],
            "negative_symptoms": [],

            "possible_emergency": False
        }