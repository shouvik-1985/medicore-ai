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
    symptoms = [
        s.lower()
        for s in medical_features.get(
            "primary_symptoms",
            []
        )
    ]

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

        expected = (
            SYMPTOM_SUPPORT.get(
                gpt_top,
                []
            )
        )

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
        confidence += 12

        reasons.append(
            "Strong medical risk pattern"
        )

    elif risk_score >= 50:
        confidence += 8

    elif risk_score >= 30:
        confidence += 4

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