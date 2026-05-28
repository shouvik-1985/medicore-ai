import json
import re
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent

ALIASES_PATH = (
    BASE_DIR
    / "medical_knowledge"
    / "disease_aliases.json"
)


def load_aliases():
    """
    Load disease aliases JSON.
    """

    try:
        with open(
            ALIASES_PATH,
            "r",
            encoding="utf-8"
        ) as file:
            return json.load(file)

    except Exception as exc:
        print(
            "❌ Alias loading failed:",
            exc
        )

        return {}


DISEASE_ALIASES = load_aliases()


def normalize_condition_name(name):
    """
    Convert disease aliases
    to canonical medical name.
    """

    if not name:
        return ""

    cleaned = (
        str(name)
        .strip()
        .lower()
    )

    cleaned = re.sub(
        r"\s+",
        " ",
        cleaned
    )

    # Search aliases
    for (
        canonical,
        aliases
    ) in DISEASE_ALIASES.items():

        alias_set = [
            a.lower()
            for a in aliases
        ]

        match_found = False

        # Exact canonical match
        if (
            cleaned
            == canonical.lower()
        ):
            match_found = True

        # Exact alias match
        elif (
            cleaned
            in alias_set
        ):
            match_found = True

        # Partial medical phrase match
        else:

            for alias in alias_set:

                alias = (
                    alias
                    .strip()
                    .lower()
                )

                # Exact phrase
                if (
                    cleaned
                    == alias
                ):
                    match_found = True
                    break

                # Disease sentence begins with alias
                elif cleaned.startswith(
                    alias + " "
                ):
                    match_found = True
                    break

                # Longer medical alias only
                elif (
                    len(alias) > 15
                    and alias in cleaned
                ):
                    match_found = True
                    break

        if match_found:
            return canonical

    return name.strip()


def normalize_conditions(
    conditions
):
    """
    Normalize +
    remove duplicates.
    """

    seen = set()

    normalized = []

    for item in conditions:

        # -------------------------
        # Dict format
        # -------------------------

        if isinstance(item, dict):

            canonical = (
                normalize_condition_name(
                    item.get(
                        "name",
                        ""
                    )
                )
            )

            key = (
                canonical
                .strip()
                .lower()
            )

            if key in seen:
                continue

            seen.add(key)

            item["name"] = canonical

            normalized.append(
                item
            )

        # -------------------------
        # String format
        # -------------------------

        else:

            canonical = (
                normalize_condition_name(
                    str(item)
                )
            )

            key = (
                canonical
                .strip()
                .lower()
            )

            if key in seen:
                continue

            seen.add(key)

            normalized.append(
                canonical
            )

    return normalized