SYMPTOM_SUPPORT = {

    "stroke": [
        "slurred speech",
        "weakness"
    ],

    "acute coronary syndrome": [
        "chest pain",
        "jaw pain",
        "arm pain"
    ],

    "pneumonia": [
        "fever",
        "cough",
        "shortness of breath"
    ]
}

AI_SOURCE_CONFIDENCE = {
    "gpt": 12,
    "gemini": 9,
    "huggingface": 6
}

HIGH_RISK_DISEASES = [
    "stroke",
    "heart attack",
    "acute coronary syndrome",
    "pulmonary embolism",
    "myocardial infarction",
    "heart failure",
    "sepsis"
]

CONTRADICTION_RULES = {
    "stroke": [
        "fever",
        "runny nose",
        "cough"
    ],

    "acute coronary syndrome": [
        "runny nose",
        "sore throat"
    ],

    "pneumonia": [
        "no cough"
    ],

    "migraine": [
        "chest pain"
    ]
}
def calculate_confidence(
    gpt_conditions,
    ml_conditions,
    dl_conditions,
    similar_cases,
    risk_score,
    medical_features,
    ai_source="gpt",
    meditron_used=False
):
    """
    Evidence-based medical confidence.
    """

    confidence = 20
    reasons = []

    confidence += AI_SOURCE_CONFIDENCE.get(
        ai_source,
        5
    )

    reasons.append(
        f"Primary model: {ai_source.upper()}"
    )

    symptoms = [
        s.lower()
        for s in medical_features.get(
            "primary_symptoms",
            []
        )
    ]

    feature_score = 0

    feature_score += len(
        medical_features.get(
            "primary_symptoms",
            []
        )
    )

    feature_score += len(
        medical_features.get(
            "secondary_symptoms",
            []
        )
    )

    feature_score += len(
        medical_features.get(
            "risk_flags",
            []
        )
    )

    confidence += min(
        feature_score,
        10
    )

    if feature_score >= 5:
        reasons.append(
            "Rich symptom evidence"
        )

    gpt_top = (
        gpt_conditions[0]["name"].lower()
        if gpt_conditions
        else None
    )

    ml_names = {
        c["name"].lower()
        if isinstance(c, dict)
        else str(c).lower()
        for c in ml_conditions
    }

    dl_names = {
        c["name"].lower()
        if isinstance(c, dict)
        else str(c).lower()
        for c in dl_conditions
    }

    # -------------------------
    # Symptom consistency
    # -------------------------

    if gpt_top:

        expected = []

        for disease, disease_symptoms in SYMPTOM_SUPPORT.items():
            if disease in gpt_top:
                expected = disease_symptoms
                break

        if expected:

            matched = sum(
                1
                for symptom
                in expected
                if symptom in symptoms
            )

            confidence += (
                matched * 4
            )

            if matched == 0:

                confidence -= 10

                reasons.append(
                    "Weak symptom match"
                )

    # -------------------------
    # Contradiction detection
    # -------------------------

    if gpt_top:

        contradictions = (
            CONTRADICTION_RULES.get(
                gpt_top,
                []
            )
        )

        contradiction_hits = sum(
            1
            for symptom
            in contradictions
            if symptom in symptoms
        )

        if contradiction_hits:

            penalty = (
                contradiction_hits * 5
            )

            confidence -= penalty

            reasons.append(
                "Some symptoms contradict diagnosis"
            )

    # -------------------------
    # GPT + ML agreement
    # -------------------------

    if gpt_top and any(
        gpt_top in x or x in gpt_top
        for x in ml_names
    ):
        confidence += 12

        reasons.append(
            "ML agrees with GPT"
        )

    # -------------------------
    # GPT + DL agreement
    # -------------------------

    if gpt_top and any(
        gpt_top in x or x in gpt_top
        for x in dl_names
    ):
        confidence += 10

        reasons.append(
            "DL agrees with GPT"
        )

    # -------------------------
    # Multi-model medical reasoning
    # -------------------------

    if meditron_used:
        confidence += 5

        reasons.append(
            "Secondary medical model reviewed case"
        )

    if (
        meditron_used
        and ai_source == "gpt"
    ):
        confidence += 5

        reasons.append(
            "Multi-model reasoning agreement"
        )

    # -------------------------
    # Similar doctor cases
    # -------------------------

    if similar_cases:
        similar_bonus = min(
            len(similar_cases) * 8,
            20
        )

        confidence += similar_bonus

        reasons.append(
            f"{len(similar_cases)} similar cases found"
        )

    # -------------------------
    # Rule engine medical risk
    # -------------------------

    if risk_score >= 80:
        confidence += 8

        reasons.append(
            "Strong medical risk pattern"
        )

    elif risk_score >= 50:
        confidence += 8

    elif risk_score >= 30:
        confidence += 4

    # -------------------------
    # High-risk disease logic
    # -------------------------

    if gpt_top:

        if any(
            disease in gpt_top
            for disease
            in HIGH_RISK_DISEASES
        ):

            if risk_score >= 60:
                confidence += 8

                reasons.append(
                    "High-risk disease pattern"
                )

            else:
                confidence -= 8

                reasons.append(
                    "Weak evidence for dangerous condition"
                )

    # -------------------------
    # Emergency escalation
    # -------------------------

    if (
        risk_score >= 80
        and gpt_conditions
    ):
        confidence += 5

        reasons.append(
            "Emergency symptom pattern"
        )

    # -------------------------
    # Uncertainty calibration
    # -------------------------

    agreement_count = 0

    if gpt_top and any(
        gpt_top in x or x in gpt_top
        for x in ml_names
    ):
        agreement_count += 1

    if gpt_top and any(
        gpt_top in x or x in gpt_top
        for x in dl_names
    ):
        agreement_count += 1

    if similar_cases:
        agreement_count += 1

    # weak agreement
    if agreement_count == 0:
        confidence -= 10

        reasons.append(
            "Low supporting evidence"
        )

    elif agreement_count == 1:
        confidence -= 3

    # -------------------------
    # Clamp
    # -------------------------

    confidence = min(
        max(confidence, 35),
        95
    )

    return {
        "score": confidence,
        "reasons": reasons
    }