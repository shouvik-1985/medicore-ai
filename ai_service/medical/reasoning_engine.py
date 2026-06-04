CARDIAC_KEYWORDS = [
    "chest pain",
    "chest heaviness",
    "shortness of breath",
]

EXERTION_TRIGGERS = [
    "walking",
    "climbing stairs",
    "exercise",
    "running",
    "exertion",
]

DISEASE_PATTERNS = {

    "stroke": [
        "slurred speech",
        "weakness",
        "facial drooping",
        "vision loss"
    ],

    "acute coronary syndrome": [
        "chest pain",
        "sweating",
        "jaw pain",
        "arm pain",
        "shortness of breath"
    ],

    "pneumonia": [
        "fever",
        "cough",
        "shortness of breath"
    ],

    "migraine": [
        "headache",
        "nausea",
        "light sensitivity"
    ]
}

def rerank_conditions(
    conditions,
    medical_features,
    risk_score
):
    """
    Medical reasoning layer.

    Re-ranks diagnoses based on:
    symptoms
    triggers
    risk profile
    """

    symptoms = [
        s.lower()
        for s in medical_features.get(
            "primary_symptoms",
            []
        )
    ]

    triggers = [
        t.lower()
        for t in medical_features.get(
            "trigger_factors",
            []
        )
    ]

    reranked = []

    for condition in conditions:

        name = (
            condition.get(
                "name",
                ""
            )
            .lower()
        )

        confidence = (
            condition.get(
                "confidence",
                50
            )
        )

        score = confidence

        for disease, expected_symptoms in DISEASE_PATTERNS.items():

            if disease in name:

                matched = sum(
                    1
                    for symptom
                    in expected_symptoms
                    if symptom in symptoms
                )

                mismatch = (
                    len(expected_symptoms)
                    - matched
                )

                score += matched * 5
                score -= mismatch * 2

        # ==========================
        # Cardiac exertional pattern
        # ==========================

        has_cardiac_symptoms = any(
            symptom in symptoms
            for symptom
            in CARDIAC_KEYWORDS
        )

        has_exertion = any(
            trigger in triggers
            for trigger
            in EXERTION_TRIGGERS
        )

        if (
            has_cardiac_symptoms
            and has_exertion
        ):

            # --------------------------
            # Stable angina pattern
            # --------------------------

            if "angina" in name:
                score += 20

            # --------------------------
            # Coronary artery disease
            # --------------------------

            elif (
                "coronary artery disease"
                in name
            ):
                score += 15

            # --------------------------
            # Acute Coronary Syndrome
            # Smarter medical logic
            # --------------------------

            elif (
                "acute coronary"
                in name
            ):

                emergency = (
                    medical_features.get(
                        "possible_emergency",
                        False
                    )
                )

                risk_flags = [
                    x.lower()
                    for x in medical_features.get(
                        "risk_flags",
                        []
                    )
                ]

                acs_flags = [
                    "radiating pain",
                    "sweating",
                    "rest chest pain",
                    "nausea",
                    "collapse",
                    "jaw pain",
                    "arm pain"
                ]

                # Strong ACS pattern
                if emergency or any(
                    x in risk_flags
                    for x in acs_flags
                ):
                    score += 18

                # Mild exertional symptoms only
                else:
                    score -= 5

        # ==========================
        # High-risk escalation
        # ==========================

        if risk_score >= 60:

            serious_conditions = [
                "pulmonary embolism",
                "stroke",
                "heart failure",
                "myocardial infarction"
            ]

            if any(
                x in name
                for x in serious_conditions
            ):
                score += 10

            # ACS only boosted
            # if emergency pattern exists
            elif (
                "acute coronary"
                in name
            ):

                emergency = (
                    medical_features.get(
                        "possible_emergency",
                        False
                    )
                )

                risk_flags = [
                    x.lower()
                    for x in medical_features.get(
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

                if emergency or any(
                    x in risk_flags
                    for x in acs_flags
                ):
                    score += 10

        condition[
            "reasoning_score"
        ] = score

        reranked.append(
            condition
        )

    reranked = sorted(
        reranked,
        key=lambda x: x.get(
            "reasoning_score",
            0
        ),
        reverse=True
    )

    return reranked