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

CLINICAL_PATTERNS = {

    "stroke_pattern": {
        "symptoms": [
            "slurred speech",
            "facial drooping",
            "weakness"
        ],
        "risk_score": 40,
        "alert":
            "Possible stroke pattern"
    },

    "acute_coronary_pattern": {
        "symptoms": [
            "chest pain",
            "shortness of breath",
            "sweating"
        ],
        "risk_score": 35,
        "alert":
            "Possible cardiac emergency pattern"
    },

    "pneumonia_pattern": {
        "symptoms": [
            "fever",
            "cough",
            "shortness of breath"
        ],
        "risk_score": 20,
        "alert":
            "Respiratory infection pattern"
    },

    "dehydration_pattern": {
        "symptoms": [
            "vomiting",
            "diarrhea",
            "dizziness"
        ],
        "risk_score": 15,
        "alert":
            "Possible dehydration pattern"
    }
}

TRIGGER_PATTERNS = {

    "exertional_chest_pain": {
        "symptoms": [
            "chest pain"
        ],

        "triggers": [
            "walking",
            "exercise",
            "climbing stairs",
            "running",
            "exertion"
        ],

        "risk_score": 25,

        "alert":
            "Exertional cardiac pattern"
    },

    "rest_chest_pain": {
        "symptoms": [
            "chest pain"
        ],

        "triggers": [
            "rest"
        ],

        "risk_score": 30,

        "alert":
            "Chest pain at rest"
    },

    "worsening_respiratory": {
        "symptoms": [
            "shortness of breath",
            "cough"
        ],

        "progression": [
            "worsening"
        ],

        "risk_score": 20,

        "alert":
            "Worsening respiratory pattern"
    },

    "persistent_fever": {
        "symptoms": [
            "fever"
        ],

        "duration_days": 5,

        "risk_score": 15,

        "alert":
            "Persistent fever pattern"
    }
}


def medical_rule_engine(extracted_data):
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

    triggers = [
        str(t).lower()
        for t in extracted_data.get(
            "trigger_factors",
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

    emergency = extracted_data.get(
        "possible_emergency",
        False
    )

    duration = extracted_data.get(
        "duration",
        {}
    )

    duration_days = int(
        duration.get(
            "value",
            0
        )
    )

    duration_unit = str(
        duration.get(
            "unit",
            ""
        )
    ).lower()

    if duration_unit == "weeks":
        duration_days *= 7

    elif duration_unit == "months":
        duration_days *= 30

    symptom_pattern = (
        extracted_data.get(
            "symptom_pattern",
            {}
        )
    )

    progression = str(
        symptom_pattern.get(
            "progression",
            ""
        )
    ).lower()
    red_flags = [
        str(r).lower()
        for r in extracted_data.get(
            "red_flags",
            []
        )
    ]

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
    # Clinical pattern detection
    # ==================================

    for (
        pattern_name,
        pattern
    ) in CLINICAL_PATTERNS.items():

        required_symptoms = [
            s.lower()
            for s in pattern.get(
                "symptoms",
                []
            )
        ]

        matched = sum(
            1
            for symptom
            in required_symptoms
            if symptom
            in all_symptoms
        )

        # Require at least
        # 2 symptoms match
        if matched >= 2:

            risk_score += pattern.get(
                "risk_score",
                0
            )

            alert = pattern.get(
                "alert"
            )

            if alert:
                alerts.append(
                    alert
                )

    # ==================================
    # Trigger-aware reasoning
    # ==================================

    for (
        pattern_name,
        pattern
    ) in TRIGGER_PATTERNS.items():

        required_symptoms = [
            s.lower()
            for s in pattern.get(
                "symptoms",
                []
            )
        ]

        symptom_match = any(
            symptom
            in all_symptoms
            for symptom
            in required_symptoms
        )

        if not symptom_match:
            continue

        trigger_match = True

        if pattern.get(
            "triggers"
        ):

            trigger_match = any(
                trigger in triggers
                for trigger
                in pattern.get(
                    "triggers",
                    []
                )
            )

        progression_match = True

        if pattern.get(
            "progression"
        ):

            progression_match = (
                progression
                in pattern.get(
                    "progression",
                    []
                )
            )

        duration_match = True

        if pattern.get(
            "duration_days"
        ):

            duration_match = (
                duration_days
                >=
                pattern.get(
                    "duration_days"
                )
            )

        if (
            symptom_match
            and trigger_match
            and progression_match
            and duration_match
        ):

            risk_score += (
                pattern.get(
                    "risk_score",
                    0
                )
            )

            alert = pattern.get(
                "alert"
            )

            if alert:
                alerts.append(
                    alert
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