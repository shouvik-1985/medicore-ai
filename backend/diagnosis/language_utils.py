import json
import re
from typing import Dict, List, Sequence

from django.conf import settings
from openai import OpenAI


openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

SUPPORTED_LANGUAGES: Dict[str, Dict[str, str]] = {
    "en": {"code": "en", "label": "English", "native_name": "English"},
    "hi": {"code": "hi", "label": "Hindi", "native_name": "हिन्दी"},
    "bn": {"code": "bn", "label": "Bengali", "native_name": "বাংলা"},
    "mr": {"code": "mr", "label": "Marathi", "native_name": "मराठी"},
    "ta": {"code": "ta", "label": "Tamil", "native_name": "தமிழ்"},
    "te": {"code": "te", "label": "Telugu", "native_name": "తెలుగు"},
    "gu": {"code": "gu", "label": "Gujarati", "native_name": "ગુજરાતી"},
    "kn": {"code": "kn", "label": "Kannada", "native_name": "ಕನ್ನಡ"},
    "ml": {"code": "ml", "label": "Malayalam", "native_name": "മലയാളം"},
    "pa": {"code": "pa", "label": "Punjabi", "native_name": "ਪੰਜਾਬੀ"},
    "ur": {"code": "ur", "label": "Urdu", "native_name": "اردو"},
}


LANGUAGE_ALIASES = {
    value.lower(): code
    for code, language in SUPPORTED_LANGUAGES.items()
    for value in (
        code,
        language["label"],
        language["native_name"],
    )
}


def message_text(response) -> str:
    content = response.choices[0].message.content

    if isinstance(content, str):
        return content.strip()

    parts = []
    for item in content or []:
        if isinstance(item, dict):
            text_value = item.get("text")
            if text_value:
                parts.append(str(text_value))
            continue

        text_value = getattr(item, "text", None)
        if text_value:
            parts.append(str(text_value))

    return "\n".join(parts).strip()


def normalize_language_code(value: str) -> str:
    raw = str(value or "").strip().lower()
    if raw in SUPPORTED_LANGUAGES:
        return raw

    compact = re.sub(r"[^a-z-]", "", raw)
    if compact in SUPPORTED_LANGUAGES:
        return compact

    return LANGUAGE_ALIASES.get(raw, LANGUAGE_ALIASES.get(compact, "en"))


def get_language_config(value: str) -> Dict[str, str]:
    return SUPPORTED_LANGUAGES.get(normalize_language_code(value), SUPPORTED_LANGUAGES["en"])


def needs_translation(value: str) -> bool:
    return get_language_config(value)["code"] != "en"


def _translation_rules(mode: str, target_language: str) -> str:
    if mode == "internal":
        return (
            f"Translate every item into precise clinical English. "
            f"Do not summarize. Preserve file names, section labels, structure, numbers, units, and meaning."
        )

    if mode == "doctor":
        return (
            f"Translate every item into natural {target_language} for a doctor-facing analyzer. "
            f"Translate diagnoses, disease names, symptom names, severity, findings, urgency statements, summaries, explanations, timelines, and guidance. "
            f"Do not leave diagnosis titles or explanatory sentences in English just because they are medical. "
            f"Keep only file names, measurement units, and short standard abbreviations in English when needed. "
            f"Example: 'Abdominal wall muscle strain or exertional abdominal pain' should become a natural {target_language} diagnosis title. "
            f"Example: 'The key finding is throat pain triggered by eating' should become a natural {target_language} sentence."
        )

    if mode == "doctor_list":
        return (
            f"Translate every item into natural {target_language} for a doctor-facing analyzer. "
            f"Keep only the exact medication names, test names, investigation names, procedure names, and standard abbreviations in English. "
            f"Translate all surrounding explanatory words, qualifiers, safety conditions, reasons, and sentences into {target_language}. "
            f"Generic clinical wording such as 'consider', 'review', 'focused examination', 'if symptoms persist', 'for pain relief', and 'including' must be translated. "
            f"If an item is only a bare test or medication name with no explanation, keep that exact name in English. "
            f"Example: 'Acetaminophen for pain relief if no liver disease' should become a {target_language} sentence with only 'Acetaminophen' left in English. "
            f"Example: 'Rapid strep test if infection is suspected' should become a {target_language} sentence with only 'Rapid strep test' left in English. "
            f"Example: 'Focused abdominal and groin physical examination, including cough impulse and examination while standing' should become mostly {target_language}, keeping only any true fixed medical proper noun in English."
        )

    if mode == "ui":
        return (
            f"Translate each UI label or template into natural {target_language}. "
            f"Preserve placeholders and formatting tokens exactly."
        )

    return (
        f"Translate every item into clear, natural {target_language} for a patient-facing health app. "
        f"Keep the meaning accurate and medically cautious."
    )


def translate_text_blocks(
    items: Sequence[str],
    target_language: str,
    mode: str = "patient",
) -> List[str]:
    values = [str(item or "") for item in items]
    if not values:
        return []

    non_empty = [item for item in values if str(item).strip()]
    if not non_empty:
        return values

    language = get_language_config(target_language)
    if language["code"] == "en" and mode != "internal":
        return values

    prompt = (
        "Return valid JSON only.\n"
        "Schema: {\"items\": [\"translated item 1\", \"translated item 2\"]}\n"
        "Rules:\n"
        f"- {_translation_rules(mode, language['label'])}\n"
        "- Preserve the item count and original order exactly.\n"
        "- Preserve placeholders like {count}, {index}, {gap}, {value}, {tests}, {medications}, and {alternatives} exactly as written.\n"
        "- If an input item is empty, return an empty string at the same index.\n"
        "- Do not add commentary, markdown, or extra fields.\n\n"
        f"INPUT JSON:\n{json.dumps({'items': values}, ensure_ascii=False)}"
    )

    try:
        response = openai_client.chat.completions.create(
            model="gpt-5.4-mini",
            temperature=0.1,
            messages=[
                {
                    "role": "system",
                    "content": "You are a careful medical translation assistant.",
                },
                {"role": "user", "content": prompt},
            ],
        )

        parsed = json.loads(message_text(response))
        translated = parsed.get("items", [])
        if not isinstance(translated, list) or len(translated) != len(values):
            return values

        return [str(item or "").strip() for item in translated]
    except Exception as exc:
        print("Translation fallback used:", exc)
        return values


def translate_to_english(text: str) -> str:
    translated = translate_text_blocks([text], "en", mode="internal")
    return translated[0] if translated else str(text or "")


DOCTOR_UI_COPY: Dict[str, str] = {
    "primaryAssessment": "Primary Assessment",
    "assessmentReady": "Assessment ready for review",
    "underReview": "Under review",
    "confidenceSuffix": "confidence",
    "sourcePrefix": "Source",
    "analyzedFilesPrefix": "Analyzed files",
    "defaultClinicalReasoning": "Review the ranked differential, confirm the working diagnosis, and refine the suggested workup before training the system.",
    "urgencyLevel": "Urgency Level",
    "clinicalReview": "Clinical review",
    "differentialSpread": "Differential Spread",
    "leadOverNext": "{gap}-point lead over next differential",
    "singleDominantDifferential": "Single dominant differential available",
    "mainAlternatives": "Main alternatives: {alternatives}",
    "noAdditionalAlternatives": "No additional alternatives were surfaced beyond the lead condition.",
    "workupScope": "Workup Scope",
    "workupComprehensive": "Comprehensive plan",
    "workupModerate": "Moderate plan",
    "workupFocused": "Focused plan",
    "workupSummary": "{tests} tests and {medications} treatment items suggested for review.",
    "clinicalSnapshot": "Clinical Snapshot",
    "clinicalSnapshotDescription": "Supporting context around the current AI assessment.",
    "diagnosticPriorities": "Diagnostic Priorities",
    "noPriorityDiagnosticSteps": "No priority diagnostic steps were generated in this analysis.",
    "therapeuticConsiderations": "Therapeutic Considerations",
    "noTreatmentConsiderations": "No treatment considerations were generated in this analysis.",
    "expectedTimeline": "Expected Timeline",
    "timelineNotProvided": "Timeline not provided in this analysis.",
    "similarCaseMatches": "Similar Case Matches",
    "historicalMatches": "{count} historical matches surfaced",
    "analyzedUploads": "Analyzed Uploads",
    "analyzedUploadsDescription": "These uploaded files were converted into case context for the current clinical analysis.",
    "possibleConditions": "Possible Conditions",
    "possibleConditionsDescription": "Ranked differential with confidence and severity cues.",
    "conditionsCount": "{count} conditions",
    "conditionLabel": "Condition {index}",
    "review": "Review",
    "highConfidence": "High confidence",
    "moderateConfidence": "Moderate confidence",
    "needsValidation": "Needs validation",
    "leadMatch": "Lead Match",
    "recommendedTests": "Recommended Tests",
    "recommendedTestsDescription": "Diagnostic workup suggested by the AI assessment.",
    "noTestsRecommended": "No tests recommended in this response.",
    "recommendedMedications": "Recommended Medications",
    "recommendedMedicationsDescription": "Treatment directions generated for clinician review.",
    "noMedicationsRecommended": "No medication suggestions provided in this response.",
    "doctorConfirmationWorkspace": "Doctor Confirmation Workspace",
    "doctorConfirmationDescription": "Confirm the working diagnosis and adjust the structured training payload before submission.",
    "doctorFinalDiagnosis": "Doctor Final Diagnosis",
    "doctorFinalTests": "Doctor Final Tests",
    "doctorFinalMedications": "Doctor Final Medications",
    "confirmOrCorrectDiagnosis": "Confirm or correct final diagnosis before training",
    "oneTestPerLine": "One test per line",
    "oneMedicationPerLine": "One medication or treatment per line",
    "confirmationSends": "Confirmation sends the reviewed diagnosis, tests, and medication list to the training pipeline.",
    "confirmDiagnosis": "Confirm Diagnosis",
    "confirming": "Confirming...",
    "urgencyNoteHigh": "Treat as high-priority review and rule out instability or rapid deterioration early.",
    "urgencyNoteModerate": "Prioritize near-term workup, targeted testing, and close clinical follow-up.",
    "urgencyNoteLow": "Suitable for structured workup if the bedside exam and current vitals remain reassuring.",
    "similarPastCases": "Similar Past Cases",
    "similarPastCasesDescription": "Historical cases with related workups and treatment patterns.",
    "caseMatch": "Case Match {index}",
    "similarity": "{value}% similarity",
    "tests": "Tests",
    "medications": "Medications",
    "noTestHistory": "No test history available",
    "noMedicationHistory": "No medication history available",
}


PATIENT_UI_COPY: Dict[str, str] = {
    "healthInsight": "Your Health Insight",
    "assessmentReady": "Assessment ready",
    "monitorSymptoms": "Monitor symptoms",
    "topMatch": "top match",
    "analyzedFilesPrefix": "Analyzed files",
    "defaultClinicalReasoning": "This AI summary is meant to guide you, not replace a doctor. Use the urgency and precautions below to decide how soon you should seek care.",
    "likelyConcern": "Likely Concern",
    "noPrimaryConcern": "No primary concern listed",
    "howSoonToAct": "How Soon To Act",
    "suggestedNextStep": "Suggested Next Step",
    "fallbackNextStep": "Arrange a medical review if symptoms keep bothering you or become stronger.",
    "analyzedUploads": "Analyzed Uploads",
    "analyzedUploadsDescription": "These uploaded files were converted into clinical context for the same analysis.",
    "possibleConditions": "Possible Conditions",
    "possibleConditionsDescription": "These are possible explanations based on the symptoms you described.",
    "matchesCount": "{count} matches",
    "optionLabel": "Option {index}",
    "strongerMatch": "Stronger match",
    "possibleMatch": "Possible match",
    "lowerCertainty": "Lower certainty",
    "topInsight": "Top Insight",
    "precautions": "Precautions",
    "precautionsDescription": "Helpful safety steps based on the symptom pattern you shared.",
    "dietRecommendations": "Diet Recommendations",
    "dietRecommendationsDescription": "Food and hydration ideas that may support you while symptoms are being assessed.",
    "whoMayHelp": "Who May Help",
    "whoMayHelpDescription": "This suggests the type of clinician or follow-up that may be useful.",
    "fallbackConsultation": "A general medical review would be a reasonable next step if symptoms continue.",
    "recoveryOutlook": "Recovery Outlook",
    "recoveryOutlookDescription": "A general idea of how symptoms may improve once the cause is addressed.",
    "fallbackRecovery": "Recovery timing depends on the underlying cause and the treatment plan.",
    "urgency": "Urgency",
    "saveSummary": "Save Your Health Summary",
    "saveSummaryDescription": "Download a patient-friendly PDF report of this analysis for future reference.",
    "downloadPdf": "Download PDF Report",
}


MODALITY_LABELS: Dict[str, str] = {
    "text": "Text",
    "image": "Image",
    "pdf": "PDF",
    "audio": "Audio",
    "video": "Video",
    "document": "Document",
}


def build_localized_ui_copy(role: str, language_code: str) -> Dict[str, str]:
    base_copy = DOCTOR_UI_COPY if role == "doctor" else PATIENT_UI_COPY
    language = get_language_config(language_code)

    if language["code"] == "en":
        return dict(base_copy)

    keys = list(base_copy.keys())
    translated_values = translate_text_blocks(
        [base_copy[key] for key in keys],
        language["code"],
        mode="ui",
    )

    if len(translated_values) != len(keys):
        return dict(base_copy)

    return {
        key: translated_values[index] or base_copy[key]
        for index, key in enumerate(keys)
    }


def build_localized_modality_labels(language_code: str) -> Dict[str, str]:
    language = get_language_config(language_code)
    if language["code"] == "en":
        return dict(MODALITY_LABELS)

    keys = list(MODALITY_LABELS.keys())
    translated_values = translate_text_blocks(
        [MODALITY_LABELS[key] for key in keys],
        language["code"],
        mode="ui",
    )

    if len(translated_values) != len(keys):
        return dict(MODALITY_LABELS)

    return {
        key: translated_values[index] or MODALITY_LABELS[key]
        for index, key in enumerate(keys)
    }
