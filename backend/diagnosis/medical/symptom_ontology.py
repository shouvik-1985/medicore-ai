import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent

SYMPTOM_PATH = (
    BASE_DIR
    / "medical_knowledge"
    / "symptom_groups.json"
)


def load_symptom_groups():

    try:
        with open(
            SYMPTOM_PATH,
            "r",
            encoding="utf-8"
        ) as file:
            return json.load(file)

    except Exception as exc:
        print(
            "❌ Symptom ontology load failed:",
            exc
        )

        return {}


SYMPTOM_GROUPS = (
    load_symptom_groups()
)


def normalize_symptoms(
    symptom_list
):
    """
    Convert symptom aliases
    into canonical symptoms.
    """

    normalized = []

    for symptom in symptom_list:

        symptom_lower = (
            str(symptom)
            .strip()
            .lower()
        )

        matched = False

        for group in (
            SYMPTOM_GROUPS.values()
        ):

            aliases = group.get(
                "aliases",
                {}
            )

            for (
                canonical,
                alias_list
            ) in aliases.items():

                alias_lower = [
                    a.lower()
                    for a
                    in alias_list
                ]

                match_found = False

                # Exact canonical match
                if (
                    symptom_lower
                    == canonical.lower()
                ):
                    match_found = True

                # Exact alias match
                elif (
                    symptom_lower
                    in alias_lower
                ):
                    match_found = True

                # Partial match
                else:

                    for alias in alias_lower:

                        if (
                            alias in symptom_lower
                            or symptom_lower in alias
                        ):
                            match_found = True
                            break

                if match_found:

                    normalized.append(
                        canonical
                    )

                    matched = True
                    break

            if matched:
                break

        if not matched:
            normalized.append(
                symptom_lower
            )

    return list(
        dict.fromkeys(
        normalized
    )
    )