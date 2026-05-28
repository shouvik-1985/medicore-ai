from openai import OpenAI
import os
import json
from django.conf import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY)

def analyze_medical_document(text):
    prompt = f"""
        You are a strict medical document verification AI.

        Your job is to determine whether the uploaded documents are valid medical credentials for a doctor.

        VALID documents include:
        - Medical Council Registration Certificate
        - MBBS / MD Degree Certificate
        - Government-issued medical license

        INVALID documents include:
        - Aadhaar card
        - School certificates (ICSE, CBSE)
        - PAN card
        - Any unrelated ID

        Tasks:
        1. Identify document types
        2. Extract:
        - license_number (ONLY if valid medical license)
        - issuing_authority
        - expiry_date
        3. Detect issues (fraud, mismatch, irrelevant docs)
        4. Give:
        - verdict: "genuine", "suspicious", or "fake"
        - confidence (0–100)

        Rules:
        - If documents are NOT medical → mark as "fake"
        - If partially valid → "suspicious"
        - If proper medical docs → "genuine"

        Return ONLY JSON like:
        {{
        "verdict": "...",
        "confidence": 85,
        "issues": ["..."],
        "document_types": ["..."]
        }}

        Document:
        {text}
        """

    response = client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2
    )

    return json.loads(response.choices[0].message.content)


