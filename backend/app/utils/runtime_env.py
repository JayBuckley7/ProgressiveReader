"""Runtime environment helpers.

Keep these checks centralized to avoid copy/paste "is_dev" heuristics drifting
across modules.
"""

from __future__ import annotations

import os


def is_test_env() -> bool:
    """Return True when running under pytest."""
    return os.getenv("PYTEST_CURRENT_TEST") is not None


def is_dev_env() -> bool:
    """Return True when running in a developer-like environment."""
    return (
        is_test_env()
        or os.getenv("FLASK_ENV") == "development"
        or os.getenv("FLASK_DEBUG") == "1"
        or os.getenv("APP_ENV") in ("dev", "development", "local")
    )
