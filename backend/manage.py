#!/usr/bin/env python
import os
import sys


# ===== Add AI service path =====
ROOT_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

AI_SERVICE_PATH = os.path.join(
    ROOT_DIR,
    "ai_service"
)

sys.path.insert(
    0,
    AI_SERVICE_PATH
)
# ===============================


def main():
    os.environ.setdefault(
        'DJANGO_SETTINGS_MODULE',
        'ai_backend.settings'
    )

    try:
        from django.core.management import (
            execute_from_command_line
        )

    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django."
        ) from exc

    execute_from_command_line(
        sys.argv
    )


if __name__ == '__main__':
    main()