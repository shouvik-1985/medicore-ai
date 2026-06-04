import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent

RULES_PATH = (
    BASE_DIR
    / "medical_knowledge"
    / "emergency_rules.json"
)


def load_rules():
    """
    Load emergency medical rules.
    """

    try:
        with open(
            RULES_PATH,
            "r",
            encoding="utf-8"
        ) as file:
            return json.load(file)

    except Exception as exc:
        print(
            "❌ Rule loading failed:",
            exc
        )

        return {}


MEDICAL_RULES = load_rules()

RISK_WEIGHTS = {

    "chest pain": 25,
    "shortness of breath": 30,

    "slurred speech": 45,
    "facial drooping": 50,
    "weakness": 20,

    "high fever": 12,
    "persistent fever": 15,

    "collapse": 55,
    "unconscious": 60,

    "severe headache": 18,

    "confusion": 22,
    "dizziness": 10,

    "vomiting": 8,
    "sweating": 12
}


def medical_rule_engine(
    extracted_data
):
    """
    Knowledge-driven
    medical risk engine.
    """

    risk_score = 0
    alerts = []

    symptoms = [
        str(s).lower()
        for s in extracted_data.get(
            "primary_symptoms",
            []
        )
    ]

    secondary_symptoms = [
        str(s).lower()
        for s in extracted_data.get(
            "secondary_symptoms",
            []
        )
    ]

    all_symptoms = (
        symptoms
        +
        secondary_symptoms
    )

    for symptom in all_symptoms:
        risk_score += (
            RISK_WEIGHTS.get(
                symptom,
                0
            )
        )

        triggers = [
            str(t).lower()
            for t in extracted_data.get(
                "trigger_factors",
                []
            )
        ]

    emergency = extracted_data.get(
        "possible_emergency",
        False
    )
    red_flags = [
        str(r).lower()
        for r in extracted_data.get(
            "red_flags",
            []
        )
    ]
    for symptom in all_symptoms:

        risk_score += (
            RISK_WEIGHTS.get(
                symptom,
                0
            )
        )

    # ==================================
    # Dynamic medical rules
    # ==================================

    for (
        rule_name,
        rule
    ) in MEDICAL_RULES.items():

        rule_symptoms = [
            s.lower()
            for s in rule.get(
                "symptoms",
                []
            )
        ]

        rule_triggers = [
            t.lower()
            for t in rule.get(
                "triggers",
                []
            )
        ]

        RISK_WEIGHTS = {
            "chest pain": 25,
            "shortness of breath": 30,
            "slurred speech": 40,
            "facial drooping": 45,
            "weakness": 20,
            "high fever": 12,
            "unconscious": 60,
            "collapse": 55,
            "severe headache": 18,
        }

        symptom_match = any(
            symptom in symptoms
            for symptom in rule_symptoms
        )

        trigger_match = True

        # Trigger-dependent rules
        if rule_triggers:
            trigger_match = any(
                trigger in triggers
                for trigger
                in rule_triggers
            )

        if (
            symptom_match
            and trigger_match
        ):
            risk_score += rule.get(
                "risk_score",
                0
            )

            alert = rule.get(
                "alert"
            )

            if alert:
                alerts.append(
                    alert
                )

    if red_flags:
        risk_score += (
            len(red_flags) * 10
        )

        alerts.append(
            "Clinical red flags detected"
        )

    # ==================================
    # Emergency escalation
    # ==================================

    if emergency:
        risk_score += 20

        alerts.append(
            "Potential emergency detected"
        )

    # ==================================
    # Urgency logic
    # ==================================

    if risk_score >= 70:
        urgency = "High"

    elif risk_score >= 40:
        urgency = "Moderate"

    else:
        urgency = "Low"

    return {
        "risk_score":
            risk_score,

        "urgency":
            urgency,

        "alerts":
            list(set(alerts))
    }