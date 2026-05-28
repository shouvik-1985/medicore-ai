from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from pathlib import Path
from records.models import DiagnosisRecord
from .ml_model import build_faiss_index, predict_disease, predict_clinical, retrieve_similar, train_clinical_model, build_prediction_text
from .medical_validator import validate_output
from .dl_model import predict_dl
from .multimodal import build_multimodal_case_payload, collapse_whitespace, message_text
from .language_utils import (
    build_localized_modality_labels,
    build_localized_ui_copy,
    get_language_config,
    translate_text_blocks,
    translate_to_english,
)
from fpdf import FPDF
from django.http import HttpResponse
from django.conf import settings
import json
import re
import requests
import time
import unicodedata
from openai import OpenAI
from diagnosis.medical.medical_extractor import (
    extract_medical_features
)

from diagnosis.medical.rule_engine import (
    medical_rule_engine
)

from diagnosis.medical.confidence_engine import (
    calculate_confidence
)

from diagnosis.medical.medical_mapper import (
    normalize_conditions
)

from diagnosis.medical.reasoning_engine import (
    rerank_conditions
)
from django.core.cache import cache

# ✅ GEMINI SDK
from google import genai

openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
client = genai.Client(
    api_key=settings.GEMINI_API_KEY,
    http_options={"api_version": "v1"}
)

def ensure_diversity(conditions):
    seen = set()
    result = []

    for c in conditions:
        key = c["name"].lower().split()[0]

        if key not in seen:
            seen.add(key)
            result.append(c)

    return result

def calibrate_confidence(conditions, ml_conditions, faiss_cases, role):
    """
    Recalculate confidence using weighted evidence.
    """

    calibrated = []

    for c in conditions:
        name = c["name"].lower()

        ai_score = c.get("confidence", 0)

        # 🔹 ML support
        ml_support = 1 if any(name in m.lower() for m in ml_conditions) else 0

        # 🔹 FAISS support (weighted by distance)
        faiss_score = 0
        for f in faiss_cases:
            if name in f["condition"].lower():
                d = f.get("distance", 1)

                # ignore bad matches
                if d < 0.01 or d > 0.6:
                    continue

                if d < 0.2:
                    faiss_score += 1.0
                elif d < 0.4:
                    faiss_score += 0.6
                else:
                    faiss_score += 0.3

        # 🔥 WEIGHTS (tuned)
        if role == "doctor":
            final_score = (
                0.5 * ai_score +
                20 * ml_support +
                15 * faiss_score
            )
        else:
            final_score = (
                0.7 * ai_score +
                10 * ml_support +
                5 * faiss_score
            )

        # clamp
        final_score = max(10, min(100, int(final_score)))

        c["confidence"] = final_score
        if "reasoning_score" in c:
            c["final_rank_score"] = (
                final_score * 0.6
                + c["reasoning_score"] * 0.4
            )
        else:
            c["final_rank_score"] = final_score
        calibrated.append(c)

    # sort
    calibrated = sorted(
        calibrated,
        key=lambda x: x.get(
            "final_rank_score",
            x["confidence"]
        ),
        reverse=True
    )

    return calibrated

def call_gpt(prompt):
    try:
        response = openai_client.chat.completions.create(
            model="gpt-5.4-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )

        return message_text(response)

    except Exception as e:
        print("GPT FAILED:", e)
        return None

# ✅ HUGGING FACE (MEDITRON)
HF_API_KEY = getattr(settings, "HF_API_KEY", None)

def call_meditron(prompt):
    if not HF_API_KEY:
        return None

    API_URL = "https://router.huggingface.co/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {HF_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            API_URL,
            headers=headers,
            json={
                "model": "meta-llama/Meta-Llama-3-8B-Instruct:fastest",
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 800,
                "temperature": 0.3
            },
            timeout=30
        )

        # 🔥 DEBUG RAW RESPONSE
        print("HF RAW RESPONSE:", response.text)

        # ✅ SAFE PARSE
        try:
            data = response.json()
        except:
            print("HF returned non-JSON response")
            return None

        # ✅ SUCCESS FORMAT (CHAT API)
        if "choices" in data:
            return data["choices"][0]["message"]["content"]

        # ❌ HANDLE ERROR
        if "error" in data:
            print("HF ERROR:", data["error"])
            return None

        return str(data)

    except Exception as e:
        print("Meditron error:", e)
        return None


# ================= SAFETY LAYER ================= #

def detect_emergency(symptoms):
    danger_keywords = [
        "chest pain", "heart attack", "stroke",
        "unconscious", "severe bleeding", "can't breathe"
    ]
    return any(k in symptoms.lower() for k in danger_keywords)


HISTORY_STOPWORDS = {
    "about", "after", "again", "also", "been", "before", "being", "between",
    "could", "from", "have", "having", "into", "just", "more", "much", "only",
    "same", "since", "some", "than", "that", "their", "them", "then", "there",
    "these", "they", "this", "those", "very", "with", "without", "when", "what",
    "your", "pain", "fever", "today", "yesterday",
}


def meaningful_tokens(value):
    return {
        token for token in re.findall(r"[a-z0-9]+", str(value or "").lower())
        if len(token) > 2 and token not in HISTORY_STOPWORDS
    }


def should_include_patient_history(current_case_text, previous_case_text):
    current_tokens = meaningful_tokens(current_case_text)
    previous_tokens = meaningful_tokens(previous_case_text)

    if not current_tokens or not previous_tokens:
        return False

    overlap = current_tokens & previous_tokens
    if len(overlap) < 4:
        return False

    combined = current_tokens | previous_tokens
    jaccard = len(overlap) / max(len(combined), 1)
    overlap_ratio = len(overlap) / max(min(len(current_tokens), len(previous_tokens)), 1)
    continuation_cues = (
        "again", "same as before", "still having", "ongoing", "persistent",
        "recurring", "follow up", "follow-up", "not improving", "worsening",
    )
    mentions_continuation = any(cue in current_case_text.lower() for cue in continuation_cues)

    return mentions_continuation or (len(overlap) >= 5 and (jaccard >= 0.33 or overlap_ratio >= 0.55))


def build_patient_history_text(user, current_case_text):
    records = DiagnosisRecord.objects.filter(user=user).order_by("-id")[:5]
    related_history = []

    for record in records:
        previous_case_text = collapse_whitespace(record.analysis_context or record.symptoms)
        if should_include_patient_history(current_case_text, previous_case_text):
            related_history.append(previous_case_text)
        if len(related_history) >= 2:
            break

    return " | ".join(related_history)


# ================= SMART ROUTER ================= #

def is_complex_case(symptoms):
    keywords = ["chronic", "severe", "multiple", "long-term", "unknown", "persistent","chest pain", "heart pain", "tight chest",
    "shortness of breath", "can't breathe", "breathing difficulty",
    "unconscious", "fainted", "collapse",
    "seizure", "convulsion",
    "severe bleeding", "blood loss",
    "stroke", "paralysis", "slurred speech",
    "high fever", "very high fever",
    "severe headache", "worst headache",
    "confusion", "disorientation","chronic", "persistent", "long-term",
    "severe", "intense", "worsening",
    "multiple symptoms", "combination of symptoms",
    "unknown cause", "undiagnosed",
    "recurring", "frequent",
    "not improving", "getting worse",
    "fatigue", "extreme weakness",
    "weight loss", "unexplained weight loss",
    "swelling", "inflammation",
    "infection", "pain spreading", "diabetes", "hypertension", "asthma",
    "cancer", "tumor", "infection",
    "heart disease", "lung disease",
    "kidney problem", "liver issue",
    "autoimmune", "thyroid",
    "blood pressure", "oxygen level"]
    return any(k in symptoms.lower() for k in keywords)


# ================= GEMINI CALL ================= #

def call_gemini(prompt):
    for attempt in range(3):  # retry 3 times
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )

            # safety check
            if not response or not response.text:
                return None

            return response.text

        except Exception as e:
            print(f"Gemini unavailable attempt {attempt+1}: {e}")
            time.sleep(2)

    return None


# ================= 🔥 NEW SMART FUSION ================= #

def safe_parse(output):
    if not output:
        return None

    try:
        # ✅ Extract JSON block ONLY
        match = re.search(r'```json\s*(\{.*?\})\s*```', output, re.DOTALL)

        if match:
            json_text = match.group(1)
        else:
            json_text = output.strip()

        return json.loads(json_text)

    except Exception as e:
        print("Parse error:", e)
        return None


def smart_fusion(gemini_output, meditron_output):
    gemini_json = safe_parse(gemini_output)
    meditron_json = safe_parse(meditron_output) if meditron_output else None

    if not gemini_json:
        return {"error": "Failed to parse Gemini output"}

    # If Meditron failed → fallback
    if not meditron_json:
        return gemini_json

    try:
        g_conditions = {c["name"].lower(): c for c in gemini_json.get("possible_conditions", [])}
        m_conditions = {c["name"].lower(): c for c in meditron_json.get("possible_conditions", [])}

        final_conditions = []

        # ✅ Merge conditions
        for name, g_data in g_conditions.items():
            if name in m_conditions:
                avg_conf = (g_data.get("confidence", 50) + m_conditions[name].get("confidence", 50)) // 2
                g_data["confidence"] = min(avg_conf + 10, 100)
            else:
                g_data["confidence"] = max(g_data.get("confidence", 50) - 15, 10)

            final_conditions.append(g_data)

        # Add Meditron-only conditions
        for name, m_data in m_conditions.items():
            if name not in g_conditions:
                m_data["confidence"] = min(m_data.get("confidence", 40), 50)
                final_conditions.append(m_data)

        gemini_json["possible_conditions"] = final_conditions

        # ✅ Urgency override (safety)
        if meditron_json.get("urgency") == "HIGH":
            gemini_json["urgency"] = "HIGH"

        # ✅ Confidence score
        gemini_json["confidence_score"] = sum(
            c["confidence"] for c in final_conditions
        ) // max(len(final_conditions), 1)

        # Merge tests
        if meditron_json.get("recommended_tests"):
            gemini_json["recommended_tests"] = list(set(
                gemini_json.get("recommended_tests", []) +
                meditron_json.get("recommended_tests", [])
            ))

        # Merge medications
        if meditron_json.get("recommended_medications"):
            gemini_json["recommended_medications"] = list(set(
                gemini_json.get("recommended_medications", []) +
                meditron_json.get("recommended_medications", [])
            ))

        return gemini_json

    except Exception as e:
        print("Fusion error:", e)
        return gemini_json

def build_prompt(
    symptoms,
    history,
    role,
    extracted_features=None,
    rule_result=None
):
    base_schema = """
{
  "possible_conditions": [
    {
      "name": "...",
      "severity": "...",
      "confidence": 85
    }
  ],
  "precautions": [
    "..."
  ],
  "diet_recommendations": [
    "..."
  ],
  "specialist_consultation": "...",
  "recovery_timeline": "...",
  "urgency": "...",
  "confidence_score": 0,
  "clinical_reasoning": "...",
  "disclaimer": "This is AI-generated advice."
}
"""

    doctor_extra = """
,
"recommended_tests": [
  "..."
],
"recommended_medications": [
  "..."
],
"clinical_reasoning": "..."
"""

    if role == "doctor":
        schema = base_schema[:-2] + doctor_extra + "\n}"
        tone = "advanced clinical decision support AI"
    else:
        schema = base_schema
        tone = "safe medical assistant"

    prompt = f"""
You are a {tone}.

PATIENT SYMPTOMS:
{symptoms}

STRUCTURED CLINICAL FINDINGS:

Primary symptoms:
{', '.join(extracted_features.get('primary_symptoms', []))}

Body regions:
{', '.join(extracted_features.get('body_regions', []))}

Trigger factors:
{', '.join(extracted_features.get('trigger_factors', []))}

Risk flags:
{', '.join(extracted_features.get('risk_flags', []))}

Possible emergency:
{extracted_features.get('possible_emergency')}

Medical urgency:
{rule_result.get('urgency')}

Risk score:
{rule_result.get('risk_score')}

Patient history:
{history if history else "No relevant history"}

STRICT RULES:
- Return ONLY valid JSON
- Never write explanation outside JSON
- Always provide at least 3 possible conditions
- Never leave arrays empty
- Confidence should be realistic
- For doctor role always provide tests and medications
- Use structured findings strongly
- Be medically cautious

Return EXACT JSON structure:

{schema}
"""

    return prompt


def normalize_condition_name(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def prediction_matches_conditions(prediction, conditions):
    prediction_name = normalize_condition_name(prediction)
    if not prediction_name:
        return False

    for condition in conditions:
        condition_name = normalize_condition_name(condition.get("name", ""))
        if prediction_name == condition_name:
            return True
        if len(prediction_name) >= 6 and prediction_name in condition_name:
            return True
        if len(condition_name) >= 6 and condition_name in prediction_name:
            return True

    return False

def remove_duplicates(conditions):
    seen = {}

    for c in conditions:
        name = c["name"].lower()

        # keep highest confidence version
        if name not in seen or c.get("confidence", 0) > seen[name].get("confidence", 0):
            seen[name] = c

    return list(seen.values())


def media_label(media_type):
    labels = {
        "image": "Image",
        "pdf": "PDF",
        "audio": "Audio",
        "video": "Video",
        "document": "Document",
    }
    return labels.get(str(media_type or "").lower(), str(media_type or "File").title())


def apply_localized_output(final_output, language_code, role, input_summary):
    language = get_language_config(language_code)
    ui_copy = build_localized_ui_copy(role, language["code"])
    modality_labels = build_localized_modality_labels(language["code"])
    possible_conditions = []
    for condition in final_output.get("possible_conditions", []) or []:
        if isinstance(condition, dict):
            possible_conditions.append(condition)

    attachments = []
    for attachment in final_output.get("attachment_summaries", []) or []:
        if isinstance(attachment, dict):
            attachments.append(attachment)

    similar_cases = []
    for case_item in final_output.get("similar_cases", []) or []:
        if isinstance(case_item, dict):
            similar_cases.append(case_item)

    final_output["response_language"] = language["code"]
    final_output["response_language_label"] = language["label"]
    final_output["ui_copy"] = ui_copy
    final_output["diagnosis_display"] = str(final_output.get("diagnosis") or "")
    final_output["severity_display"] = str(final_output.get("severity") or "")
    final_output["urgency_display"] = str(final_output.get("urgency") or "")
    final_output["input_summary"] = str(input_summary or "").strip()
    final_output["recommended_tests_display"] = [str(item or "") for item in final_output.get("recommended_tests", []) or []]
    final_output["recommended_medications_display"] = [
        str(item or "") for item in final_output.get("recommended_medications", []) or []
    ]
    final_output["input_modalities_display"] = [
        modality_labels.get(str(modality or "").lower(), str(modality or ""))
        for modality in final_output.get("input_modalities", []) or []
    ]

    for condition in possible_conditions:
        condition["display_name"] = str(condition.get("name") or "")
        condition["severity_display"] = str(condition.get("severity") or "")

    for attachment in attachments:
        attachment["media_label"] = modality_labels.get(
            str(attachment.get("media_type") or "").lower(),
            media_label(attachment.get("media_type")),
        )

    for case_item in similar_cases:
        case_item["tests_display"] = [str(item or "") for item in case_item.get("tests", []) or []]
        case_item["meds_display"] = [str(item or "") for item in case_item.get("meds", []) or []]

    if language["code"] == "en":
        final_output["possible_conditions"] = possible_conditions
        final_output["attachment_summaries"] = attachments
        final_output["similar_cases"] = similar_cases
        return final_output

    def translate_targets(plan, mode):
        if not plan:
            return

        source_values = [default_value for _, default_value in plan]
        translated_values = translate_text_blocks(source_values, language["code"], mode=mode)
        if len(translated_values) != len(plan):
            translated_values = source_values

        for translated_value, target in zip(translated_values, plan):
            location = target[0][0]

            if location == "root":
                _, field_name = target[0]
                final_output[field_name] = translated_value or final_output.get(field_name, "")
                continue

            if location == "list":
                _, field_name, index = target[0]
                current_items = list(final_output.get(field_name, []) or [])
                if index < len(current_items):
                    current_items[index] = translated_value or current_items[index]
                    final_output[field_name] = current_items
                continue

            if location == "condition":
                _, index, field_name = target[0]
                if index < len(possible_conditions):
                    possible_conditions[index][field_name] = translated_value or possible_conditions[index].get(field_name, "")
                continue

            if location == "attachment":
                _, index, field_name = target[0]
                if index < len(attachments):
                    attachments[index][field_name] = translated_value or attachments[index].get(field_name, "")
                continue

            if location == "similar_case":
                _, case_index, field_name, item_index = target[0]
                if case_index < len(similar_cases):
                    items = list(similar_cases[case_index].get(field_name, []) or [])
                    if item_index < len(items):
                        items[item_index] = translated_value or items[item_index]
                        similar_cases[case_index][field_name] = items

    general_plan = []
    list_plan = []

    def queue(plan, target, value):
        plan.append((target, str(value or "").strip()))

    queue(general_plan, ("root", "diagnosis_display"), final_output.get("diagnosis"))
    queue(general_plan, ("root", "severity_display"), final_output.get("severity"))
    queue(general_plan, ("root", "urgency_display"), final_output.get("urgency"))
    queue(general_plan, ("root", "clinical_reasoning"), final_output.get("clinical_reasoning"))
    queue(general_plan, ("root", "specialist_consultation"), final_output.get("specialist_consultation"))
    queue(general_plan, ("root", "recovery_timeline"), final_output.get("recovery_timeline"))
    queue(general_plan, ("root", "disclaimer"), final_output.get("disclaimer"))

    for index, item in enumerate(final_output.get("precautions", []) or []):
        queue(general_plan, ("list", "precautions", index), item)

    for index, item in enumerate(final_output.get("diet_recommendations", []) or []):
        queue(general_plan, ("list", "diet_recommendations", index), item)

    for index, condition in enumerate(possible_conditions):
        queue(general_plan, ("condition", index, "display_name"), condition.get("name"))
        queue(general_plan, ("condition", index, "severity_display"), condition.get("severity"))

    for index, attachment in enumerate(attachments):
        queue(general_plan, ("attachment", index, "summary"), attachment.get("summary"))

    for index, item in enumerate(final_output.get("recommended_tests_display", []) or []):
        queue(list_plan, ("list", "recommended_tests_display", index), item)

    for index, item in enumerate(final_output.get("recommended_medications_display", []) or []):
        queue(list_plan, ("list", "recommended_medications_display", index), item)

    for case_index, case_item in enumerate(similar_cases):
        for item_index, item in enumerate(case_item.get("tests_display", []) or []):
            queue(list_plan, ("similar_case", case_index, "tests_display", item_index), item)
        for item_index, item in enumerate(case_item.get("meds_display", []) or []):
            queue(list_plan, ("similar_case", case_index, "meds_display", item_index), item)

    translate_targets(general_plan, "doctor" if role == "doctor" else "patient")
    translate_targets(list_plan, "doctor_list" if role == "doctor" else "patient")

    final_output["possible_conditions"] = possible_conditions
    final_output["attachment_summaries"] = attachments
    final_output["similar_cases"] = similar_cases
    return final_output
# ================= MAIN VIEW ================= #

class DiagnosisView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        symptoms = collapse_whitespace(request.data.get("symptoms", ""))
        requested_language = request.data.get("response_language", request.data.get("language", "en"))
        response_language = get_language_config(requested_language)
        uploaded_files = request.FILES.getlist("attachments")

        if not symptoms and not uploaded_files:
            return Response({"error": "Provide symptoms text or upload at least one file."}, status=400)

        try:
            case_payload = build_multimodal_case_payload(symptoms, uploaded_files)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
        except Exception as exc:
            print("Multimodal preprocessing failed:", exc)
            return Response({"error": "Failed to process the uploaded files."}, status=500)

        raw_case_text = collapse_whitespace(case_payload.get("analysis_context", ""))
        display_symptoms = collapse_whitespace(case_payload.get("display_text", ""))
        input_modalities = case_payload.get("input_modalities", [])
        uploaded_file_names = case_payload.get("uploaded_file_names", [])
        attachments = case_payload.get("attachments", [])

        case_text = raw_case_text
        if response_language["code"] != "en" and raw_case_text:
            case_text = collapse_whitespace(translate_to_english(raw_case_text))

        if not case_text:
            return Response({"error": "No readable clinical information could be extracted from the submitted input."}, status=400)
        
        # 🧠 Medical Intelligence Layer
        # =====================================

        extracted_features = extract_medical_features(
            case_text
        )

        rule_result = medical_rule_engine(
            extracted_features
        )

        print(
            "🧠 Extracted Features:",
            extracted_features
        )

        print(
            "🩺 Rule Engine:",
            rule_result
        )

        # 🛑 EMERGENCY CHECK
        # if detect_emergency(case_text):
        #     return Response({
        #         "urgency": "HIGH",
        #         "message": "⚠️ Possible medical emergency. Seek immediate care.",
        #         "disclaimer": "This AI is not a substitute for a doctor.",
        #         "input_modalities": input_modalities,
        #         "uploaded_files": uploaded_file_names,
        #     })
        # 🛑 Emergency flag
        emergency_detected = detect_emergency(
            case_text
        )

        # 👤 USER CONTEXT
        user = request.user if request.user.is_authenticated else None

        history_text = ""
        role = "patient"
        if request.user.is_authenticated:
            role = request.user.userprofile.role  # 'doctor' or 'patient'

        if not symptoms and display_symptoms and response_language["code"] != "en":
            translated_preview = translate_text_blocks([display_symptoms], response_language["code"], mode=role)
            display_symptoms = collapse_whitespace(translated_preview[0]) if translated_preview else display_symptoms

        if user and role == "patient":
            history_text = build_patient_history_text(user, case_text)

        # build dynamic prompt
        prompt = build_prompt(case_text, history_text, role, extracted_features, rule_result)
        try:
            # ⚡ GEMINI
            print("=== AI ROUTER CALLED ===")
            meditron_output = None
            gpt_output = call_gpt(prompt)

            if gpt_output:
                print("✅ GPT SUCCESS")
                print("RAW GPT OUTPUT:")
                print(gpt_output)
                primary_output = gpt_output
                ai_source = "gpt"

            else:
                print("⚠️ GPT FAILED → switching to Gemini")

                gemini_output = call_gemini(prompt)

                if gemini_output:
                    print("✅ Gemini SUCCESS")
                    print("RAW GEMINI OUTPUT:")
                    print(gemini_output)
                    primary_output = gemini_output
                    ai_source = "gemini"

                else:
                    print("⚠️ Gemini FAILED → switching to Meditron")

                    meditron_output = call_meditron(prompt)

                    if not meditron_output:
                        return Response({"error": "All AI models failed"}, status=503)
                    
                    print("RAW MEDITRON OUTPUT:")
                    print(meditron_output)

                    primary_output = meditron_output
                    ai_source = "huggingface"

            final_output = None


            if is_complex_case(case_text):
                print("=== MEDITRON CALLED ===")
                meditron_output = call_meditron(prompt)

            if meditron_output:
                final_output = smart_fusion(primary_output, meditron_output)
            else:
                final_output = safe_parse(primary_output)


            if not final_output:
                final_output = {
                    "possible_conditions": [
                        {
                            "name": "Clinical assessment required",
                            "severity": "moderate",
                            "confidence": 50
                        }
                    ],
                    "precautions": [
                        "Seek medical consultation"
                    ],
                    "diet_recommendations": [
                        "Stay hydrated"
                    ],
                    "specialist_consultation": "General physician",
                    "recovery_timeline": "Depends on diagnosis",
                    "urgency": rule_result.get("urgency", "Moderate"),
                    "confidence_score": 50
                }

            final_output.setdefault("possible_conditions", [])
            
            # 🔥 REMOVE DUPLICATE CONDITIONS
            final_output["possible_conditions"] = remove_duplicates(
                final_output.get("possible_conditions", [])
            )

            # ================= 🔥 HYBRID CONDITION FUSION ================= #

            ml_output = predict_clinical(
                case_text,
                extracted_features,
                rule_result["urgency"]
            )

            dl_output = predict_dl(
                case_text,
                extracted_features,
                rule_result["urgency"]
            )

            _, _, faiss_cases = retrieve_similar(
                case_text,
                extracted_features,
                rule_result["urgency"]
            )

            ml_conditions = ml_output.get("conditions", [])
            dl_conditions = dl_output.get("conditions", [])
            faiss_conditions = [
                c["condition"] for c in faiss_cases
                if 0.01 < c.get("distance", 1) < 0.6
            ]


            def hybrid_condition_fusion(ai_conditions):
                combined = {}

                # 🔹 AI base
                for cond in ai_conditions:
                    name = cond["name"].lower()
                    combined[name] = {
                        "name": cond["name"],
                        "confidence": cond.get("confidence", 50),
                        "source": ["ai"]
                    }

                # 🔹 ML boost (smarter medical fusion)
                for cond in ml_conditions:

                    key = cond.lower()
                    # ACS confidence penalty
                    # (avoid overcalling ACS)
                    # --------------------------------

                    acs_penalty = 0

                    if (
                        "acute coronary syndrome"
                        in key
                    ):

                        emergency = (
                            extracted_features.get(
                                "possible_emergency",
                                False
                            )
                        )

                        risk_flags = [
                            x.lower()
                            for x in extracted_features.get(
                                "risk_flags",
                                []
                            )
                        ]

                        acs_flags = [
                            "radiating pain",
                            "sweating",
                            "rest chest pain",
                            "jaw pain",
                            "arm pain",
                            "collapse",
                            "nausea"
                        ]

                        has_acs_pattern = (
                            emergency
                            or any(
                                x in risk_flags
                                for x in acs_flags
                            )
                        )

                        # Mild exertional symptoms only
                        # lower ACS confidence
                        if not has_acs_pattern:
                            acs_penalty = 10

                    # --------------------------------
                    # Normal ML fusion
                    # --------------------------------

                    if key in combined:

                        if role == "doctor":
                            combined[key][
                                "confidence"
                            ] += (
                                4 - acs_penalty
                            )

                        else:
                            combined[key][
                                "confidence"
                            ] += (
                                2 - acs_penalty
                            )

                        combined[key][
                            "source"
                        ].append("ml")

                    else:

                        combined[key] = {
                            "name": cond,
                            "confidence": (
                                45 - acs_penalty
                            ),
                            "source": ["ml"]
                        }

                # 🔹 DL boost
                for cond in dl_conditions:
                    key = cond.lower()
                    if key in combined:
                        combined[key]["confidence"] += 8
                        combined[key]["source"].append("dl")

                # 🔹 FAISS memory
                if role == "doctor":
                    for cond in faiss_conditions:
                        key = cond.lower()
                        if key in combined:
                            combined[key]["confidence"] += 5
                            combined[key]["source"].append("faiss")

                # 🔹 sort
                results = list(combined.values())
                results.sort(key=lambda x: x["confidence"], reverse=True)
                for c in results:
                    c["confidence"] = min(c["confidence"], 95)
                return results[:5]


            # 🔥 APPLY HYBRID FUSION
            final_output["possible_conditions"] = (
                hybrid_condition_fusion(
                    final_output.get(
                        "possible_conditions",
                        []
                    )
                )
            )

            # =====================================
            # 🧠 Medical reasoning re-ranking
            # =====================================

            final_output[
                "possible_conditions"
            ] = rerank_conditions(
                final_output.get(
                    "possible_conditions",
                    []
                ),
                extracted_features,
                rule_result[
                    "risk_score"
                ]
            )

            # normalized backup
            pre_filtered_conditions = (
                normalize_conditions(
                    final_output[
                        "possible_conditions"
                    ][:]
                )
            )
            def apply_medical_priority(conditions):
                for c in conditions:
                    name = c["name"].lower()

                    if "stroke" in name or "heart attack" in name:
                        c["confidence"] += 15

                    if "cancer" in name:
                        c["confidence"] += 10

                return conditions
            final_output["possible_conditions"] = apply_medical_priority(
                final_output["possible_conditions"]
            )

            def penalize_ai_only(conditions):
                for c in conditions:
                    sources = c.get("source", [])
                    if sources == ["ai"]:
                        c["confidence"] -= 5
                return conditions

            final_output["possible_conditions"] = penalize_ai_only(
                final_output["possible_conditions"]
            )

            def validate_with_consensus(conditions, ml_conditions, faiss_conditions):
                validated = []

                for c in conditions:
                    name = c["name"].lower()

                    support_score = 0

                    def is_similar(a, b):
                        a = normalize_condition_name(a)
                        b = normalize_condition_name(b)
                        return a == b or (len(a) > 5 and a in b) or (len(b) > 5 and b in a)
                    # ML support
                    if any(is_similar(name, m) for m in ml_conditions):
                        support_score += 1

                    strong_faiss = [
                        c["condition"] for c in faiss_cases
                        if c.get("distance", 1) < 0.6
                    ]
                    # FAISS support
                    if any(is_similar(name, f) for f in strong_faiss):
                        support_score += 1

                    # AI always counts as 1
                    support_score += 1

                    # ❌ REMOVE hallucinated weak conditions
                    if role == "doctor":
                        if support_score >= 2:
                            validated.append(c)
                    else:
                        if support_score >= 1:
                            validated.append(c)

                return validated


            final_output["possible_conditions"] = validate_with_consensus(
                final_output["possible_conditions"],
                ml_conditions,
                faiss_conditions
            )

            def remove_low_confidence(conditions):
                return [c for c in conditions if c.get("confidence", 0) >= 40]


            final_output["possible_conditions"] = remove_low_confidence(
                final_output["possible_conditions"]
            )

            def remove_irrelevant_conditions(conditions, symptoms):
                filtered = []
                symptoms_lower = symptoms.lower()

                for c in conditions:
                    name = c["name"].lower()

                    if "cancer" in name and "pain" not in symptoms_lower:
                        continue

                    stroke_signs = ["numbness", "speech", "weakness", "vision"]

                    if "stroke" in name and not any(s in symptoms_lower for s in stroke_signs):
                        continue

                    filtered.append(c)

                return filtered
            
            final_output["possible_conditions"] = ensure_diversity(
                final_output["possible_conditions"]
            )

            final_output["possible_conditions"] = calibrate_confidence(
                final_output.get("possible_conditions", []),
                ml_conditions,
                faiss_cases,
                role
            )

            final_output[
                "possible_conditions"
            ] = rerank_conditions(
                final_output.get(
                    "possible_conditions",
                    []
                ),
                extracted_features,
                rule_result[
                    "risk_score"
                ]
            )

            # final ranking uses reasoning score
            final_output[
                "possible_conditions"
            ] = sorted(
                final_output[
                    "possible_conditions"
                ],
                key=lambda x: (
                    x.get(
                        "reasoning_score",
                        0
                    )
                    +
                    x.get(
                        "confidence",
                        0
                    )
                ),
                reverse=True
            )

            final_output[
                "possible_conditions"
            ] = normalize_conditions(
                final_output.get(
                    "possible_conditions",
                    []
                )
            )
            # Confidence Engine
            # =====================================
            confidence_result = calculate_confidence(
                gpt_conditions=final_output.get(
                    "possible_conditions",
                    []
                ),

                ml_conditions=[
                    {"name": c}
                    for c in ml_conditions
                ],

                dl_conditions=[
                    {"name": c}
                    for c in dl_conditions
                ],

                similar_cases=faiss_cases,

                risk_score=rule_result.get(
                    "risk_score",
                    0
                ),

                ai_source=ai_source,

                meditron_used=(
                    meditron_output
                    is not None
                )
            )

            final_output["confidence_score"] = (
                confidence_result["score"]
            )

            final_output["confidence_reasons"] = (
                confidence_result["reasons"]
            )


            final_output["possible_conditions"] = remove_irrelevant_conditions(
                final_output["possible_conditions"],
                case_text
            )

            # 🔥 Ensure doctor also has at least 2 conditions (important)
            if role == "doctor":
                conditions = final_output.get("possible_conditions", [])

                if len(conditions) < 2:
                    # 🔥 use original candidates (before filtering)
                    backup = sorted(
                        pre_filtered_conditions,
                        key=lambda x: x["confidence"],
                        reverse=True
                    )

                    final_output["possible_conditions"] = backup[:3]

            # 🔥 Ensure patient gets multiple conditions (IMPORTANT FIX)
            if role != "doctor":
                conditions = final_output.get("possible_conditions", [])

                if len(conditions) < 3:
                    all_candidates = hybrid_condition_fusion(
                        final_output.get("possible_conditions", [])
                    )

                    final_output["possible_conditions"] = all_candidates[:3]

            

            if not final_output["possible_conditions"]:
                final_output["possible_conditions"] = [{
                    "name": "Uncertain condition — requires medical evaluation",
                    "confidence": 30
                }]


            dl_support = {"conditions": [], "tests": [], "meds": []}
            final_output.setdefault("clinical_reasoning", "")
            # ensure doctor-specific fields exist
            if role == "doctor":
                final_output.setdefault("recommended_tests", [])
                final_output.setdefault("recommended_medications", [])
                final_output.setdefault("clinical_reasoning", "")


                # 🔥 GET ML + FAISS
                clinical_support = predict_clinical(
                    case_text,
                    extracted_features,
                    rule_result["urgency"]
                )

                if not clinical_support["conditions"]:
                    print("⚠️ ML model not trained yet")

                dl_support = predict_dl(
                    case_text,
                    extracted_features,
                    rule_result["urgency"]
                )

                ml_conditions = (
                    clinical_support.get("conditions", []) +
                    dl_support.get("conditions", [])
                )

                ml_tests = (
                    clinical_support.get("tests", []) +
                    dl_support.get("tests", [])
                )

                ml_meds = (
                    clinical_support.get("meds", []) +
                    dl_support.get("meds", [])
                )

                sim_tests, sim_meds, similar_cases = retrieve_similar(
                    case_text,
                    extracted_features,
                    rule_result["urgency"]
                )

                # 🔥 WEIGHTED MERGE FUNCTION
                from collections import Counter

                def weighted_merge(ai_list, ml_list, faiss_list):
                    counter = Counter()

                    # AI → base weight
                    for item in ai_list:
                        if item:
                            counter[str(item).strip()] += 5

                    # ML → medium weight
                    for item in ml_list:
                        if item:
                            counter[str(item).strip()] += 2

                    # FAISS → strong weight (experience-based)
                    for item in faiss_list:
                        if item:
                            counter[str(item).strip()] += 1

                    # sort by weight
                    sorted_items = [item for item, _ in counter.most_common()]
                    return sorted_items[:5]   # limit to top 5

                # 🔥 APPLY WEIGHTING
                ai_tests = final_output.get(
                    "recommended_tests",
                    []
                )

                ai_meds = final_output.get(
                    "recommended_medications",
                    []
                )

                weighted_tests = weighted_merge(
                    ai_tests,
                    ml_tests,
                    sim_tests
                )

                weighted_meds = weighted_merge(
                    ai_meds,
                    ml_meds,
                    sim_meds
                )

                # --------------------------------
                # Keep GPT doctor output
                # --------------------------------

                if ai_tests:
                    weighted_tests = list(
                        dict.fromkeys(
                            ai_tests +
                            weighted_tests
                        )
                    )

                if ai_meds:
                    weighted_meds = list(
                        dict.fromkeys(
                            ai_meds +
                            weighted_meds
                        )
                    )

                final_output[
                    "recommended_tests"
                ] = weighted_tests[:5]

                final_output[
                    "recommended_medications"
                ] = weighted_meds[:5]

                final_output[
                    "similar_cases"
                ] = [
                    c for c in similar_cases
                    if 0.01 < c.get(
                        "distance",
                        1
                    ) < 0.6
                ]

                local_condition_support = []
                for local_condition in ml_conditions:
                    if prediction_matches_conditions(
                        local_condition,
                        final_output.get("possible_conditions", [])
                    ):
                        local_condition_support.append(local_condition)

                if local_condition_support:
                    final_output["local_ml_condition_support"] = list(dict.fromkeys(local_condition_support))
                    supported_conditions = [{"name": name} for name in local_condition_support]

                    for condition in final_output.get("possible_conditions", []):
                        if prediction_matches_conditions(condition.get("name"), supported_conditions):
                            condition["confidence"] = min(
                                condition.get("confidence", 50) + 5,
                                100
                            )

            # ML prediction
            ml_prediction = predict_disease(
                build_prediction_text(
                    case_text,
                    extracted_features,
                    rule_result["urgency"]
                )
            )
            current_conditions = final_output.get("possible_conditions", [])
            if prediction_matches_conditions(ml_prediction, current_conditions):
                final_output["ml_prediction"] = ml_prediction

            # Safety validation
            final_output = validate_output(final_output)
            final_output["ai_source"] = ai_source
            final_output["input_modalities"] = input_modalities
            final_output["uploaded_files"] = uploaded_file_names
            final_output["input_summary"] = display_symptoms
            final_output["attachment_summaries"] = attachments

        # ✅ FINAL OUTPUT
            print("=== FINAL OUTPUT ===", final_output)
            # Rule Engine Safety Override
            # =====================================

            rule_urgency = rule_result.get(
                "urgency",
                "Low"
            )

            current_urgency = (
                final_output.get("urgency")
                or "Low"
            ).lower()

            urgency_priority = {
                "low": 1,
                "moderate": 2,
                "high": 3
            }

            if urgency_priority.get(
                rule_urgency.lower(),
                1
            ) > urgency_priority.get(
                current_urgency,
                1
            ):
                final_output["urgency"] = rule_urgency

            if not final_output.get("urgency"):
                final_output["urgency"] = "Moderate"

            # 🔥 emergency override
            if emergency_detected:
                final_output["urgency"] = "High"

                final_output.setdefault(
                    "precautions",
                    []
                )

                final_output["precautions"].insert(
                    0,
                    "Seek urgent medical evaluation immediately."
                )

            primary_condition = (final_output.get("possible_conditions") or [{}])[0]
            primary_diagnosis = primary_condition.get("name", "")
            primary_severity = primary_condition.get("severity") or final_output.get("severity") or "Unknown"

            final_output["diagnosis"] = final_output.get("diagnosis") or primary_diagnosis
            final_output["severity"] = primary_severity
            final_output = apply_localized_output(
                final_output,
                response_language["code"],
                role,
                display_symptoms,
            )

            try:
                # 🔍 Check last record (avoid duplicates)
                existing = DiagnosisRecord.objects.filter(
                    user=user,
                    symptoms=display_symptoms,
                    analysis_context=case_text,
                ).order_by('-id').first()

                if existing:
                    # 🔁 UPDATE existing record
                    existing.symptoms = display_symptoms
                    existing.analysis_context = case_text
                    existing.input_modalities = input_modalities
                    existing.uploaded_file_names = uploaded_file_names
                    existing.result = primary_diagnosis
                    existing.severity = primary_severity
                    existing.report_text = json.dumps(final_output)

                    existing.possible_conditions = final_output.get("possible_conditions")
                    existing.recommended_medications = final_output.get("recommended_medications")
                    existing.recommended_tests = final_output.get("recommended_tests")
                    existing.precautions = final_output.get("precautions")
                    existing.diet_recommendations = final_output.get("diet_recommendations")
                    existing.specialist_consultation = final_output.get("specialist_consultation")
                    existing.recovery_timeline = final_output.get("recovery_timeline")
                    existing.urgency = final_output.get("urgency") or "Moderate"
                    # Medical Intelligence Layer
                    # ---------------------------------
                    existing.medical_features = extracted_features
                    existing.risk_score = rule_result[
                        "risk_score"
                    ]
                    existing.risk_alerts = rule_result[
                        "alerts"
                    ]
                    existing.diagnosis_source = (
                        ai_source
                    )
                    existing.save()
                    record = existing

                else:
                    # 🆕 CREATE new record
                    record = DiagnosisRecord.objects.create(
                        user=user,
                        symptoms=display_symptoms,
                        analysis_context=case_text,
                        input_modalities=input_modalities,
                        uploaded_file_names=uploaded_file_names,
                        result=primary_diagnosis,
                        severity=primary_severity,
                        report_text=json.dumps(final_output),

                        possible_conditions=final_output.get("possible_conditions"),
                        recommended_medications=final_output.get("recommended_medications"),
                        recommended_tests=final_output.get("recommended_tests"),
                        precautions=final_output.get("precautions"),
                        diet_recommendations=final_output.get("diet_recommendations"),
                        specialist_consultation=final_output.get("specialist_consultation"),
                        recovery_timeline=final_output.get("recovery_timeline"),
                        urgency=final_output.get("urgency") or "Moderate",
                        # Medical Intelligence Layer
                        # ---------------------------------
                        medical_features=
                        extracted_features,
                        risk_score=
                        rule_result["risk_score"],
                        risk_alerts=
                        rule_result["alerts"],
                        diagnosis_source=
                        ai_source,
                    )

                final_output["id"] = record.id
                cache.delete(
                    f"user_records_{user.id}"
                )

            except Exception as e:
                print("Save error:", e)

            return Response(final_output)

        except Exception as e:
            import traceback
            print("Traceback error:\n", traceback.format_exc())
            return Response({"error": str(e)}, status=500)


# ================= PDF ================= #

class GenerateDiagnosisPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data

        pdf = FPDF()
        pdf.add_page()
        language = get_language_config(request.data.get("response_language", "en"))
        unicode_font_active = False

        try:
            font_path = None
            if language["code"] != "en":
                if language["code"] in {"hi", "bn", "mr", "ta", "te", "gu", "kn", "ml", "pa"}:
                    font_path = Path(r"C:\Windows\Fonts\Nirmala.ttc")
                else:
                    font_path = Path(r"C:\Windows\Fonts\SegoeUI.ttf")

            if font_path and font_path.exists():
                pdf.add_font("MediCoreUnicode", "", str(font_path), uni=True)
                pdf.set_font("MediCoreUnicode", size=12)
                unicode_font_active = True
            else:
                pdf.set_font("Arial", size=12)
        except Exception as exc:
            print("PDF unicode font fallback used:", exc)
            pdf.set_font("Arial", size=12)

        def sanitize_pdf_text(value):
            text = str(value or "N/A")
            if unicode_font_active:
                return text

            replacements = {
                "\u2018": "'",
                "\u2019": "'",
                "\u201c": '"',
                "\u201d": '"',
                "\u2013": "-",
                "\u2014": "-",
                "\u2022": "-",
                "\u2026": "...",
                "\u00a0": " ",
                "\u200b": "",
            }

            for source, target in replacements.items():
                text = text.replace(source, target)

            normalized = unicodedata.normalize("NFKD", text)
            return normalized.encode("latin-1", "replace").decode("latin-1")

        def add_line(title, content):
            if unicode_font_active:
                pdf.set_font("MediCoreUnicode", size=12)
            else:
                pdf.set_font("Arial", 'B', 12)
            pdf.cell(200, 10, txt=sanitize_pdf_text(title), ln=True)
            if unicode_font_active:
                pdf.set_font("MediCoreUnicode", size=11)
            else:
                pdf.set_font("Arial", '', 11)
            pdf.multi_cell(0, 10, txt=sanitize_pdf_text(content))
            pdf.ln(2)

        add_line("Case Input", data.get("input_summary") or data.get("symptoms", "N/A"))
        add_line("Urgency", data.get("urgency_display") or data.get("urgency", "N/A"))
        add_line("Recovery Timeline", data.get("recovery_timeline", "N/A"))
        add_line("Specialist Consultation", data.get("specialist_consultation", "N/A"))

        attachment_summaries = data.get("attachment_summaries", [])
        if isinstance(attachment_summaries, list) and attachment_summaries:
            lines = []
            for item in attachment_summaries:
                if not isinstance(item, dict):
                    continue
                media_type = str(item.get("media_label") or item.get("media_type", "file")).upper()
                name = str(item.get("name", "attachment"))
                summary = str(item.get("summary", ""))
                lines.append(f"- {media_type}: {name}")
                if summary:
                    lines.append(f"  {summary}")
            if lines:
                add_line("Analyzed Uploads", "\n".join(lines))

        for title, items in {
            "Possible Conditions": data.get("possible_conditions", []),
            #"Recommended Medications": data.get("recommended_medications", []),
            #"Recommended Tests": data.get("recommended_tests", []),
            "Precautions": data.get("precautions", []),
            "Diet Recommendations": data.get("diet_recommendations", []),
        }.items():
            if isinstance(items, list) and all(isinstance(i, dict) for i in items):
                lines = [
                    f"- {i.get('display_name') or i.get('name', '')} ({i.get('confidence', '')}%)"
                    for i in items
                ]
            else:
                lines = [f"- {str(i)}" for i in items] if items else ["N/A"]

            add_line(title, "\n".join(lines))

        pdf_bytes = pdf.output(dest='S').encode('latin1')
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = 'attachment; filename="diagnosis_report.pdf"'

        return response
