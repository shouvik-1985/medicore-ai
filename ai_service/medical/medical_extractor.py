import json
import os
from openai import OpenAI
from django.conf import settings
from medical.symptom_ontology import (
    normalize_symptoms
)
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)


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
    "duration": "",
    "trigger_factors": [],
    "risk_flags": [],
    "possible_emergency": false
}}

Rules:
- Do not diagnose.
- Do not explain.
- No markdown.
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

        extracted = json.loads(
            content
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

        return extracted

    except Exception as e:
        print("❌ Medical extractor failed:", e)

        return {
            "primary_symptoms": [],
            "secondary_symptoms": [],
            "body_regions": [],
            "severity": "",
            "duration": "",
            "trigger_factors": [],
            "risk_flags": [],
            "possible_emergency": False
        }