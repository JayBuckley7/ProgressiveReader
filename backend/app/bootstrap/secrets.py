"""Bootstrap: load env.json style secrets into the process environment.

This code is intentionally outside the domains (composition/bootstrap layer).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Mapping, MutableMapping, Optional

logger = logging.getLogger(__name__)


def find_secrets_path(*, env: Mapping[str, str], root_dir: str, backend_dir: str, is_dev: bool) -> str | None:
    """Locate a secrets JSON file based on the current environment."""
    possible_paths: list[str | None] = [
        env.get("APP_CONFIG_PATH"),  # Explicitly configured path takes precedence
    ]

    if is_dev:
        possible_paths += [
            os.path.join(root_dir, "env_dev.json"),  # Project root dev config
            os.path.join(backend_dir, "env_dev.json"),  # Backend dir dev config
        ]

    possible_paths += [
        "/secrets/env.json",  # Production path (Linux secrets mount)
        os.path.join(root_dir, "env.json"),  # Project root
        os.path.join(backend_dir, "env.json"),  # Backend directory
    ]

    for path in possible_paths:
        if path and os.path.exists(path):
            return path
    return None


def _set_env_key(
    env: MutableMapping[str, str],
    *,
    key: str,
    value: object,
    override_env: bool,
) -> None:
    # Special handling for values we want preserved as JSON strings.
    if key == "OPENAI_API_KEYS" and isinstance(value, list):
        s = json.dumps(value)
        if override_env:
            env[key] = s
        else:
            env.setdefault(key, s)
        return

    if key == "GOOGLE_APPLICATION_CREDENTIALS_JSON" and isinstance(value, dict):
        s = json.dumps(value)
        if override_env:
            env[key] = s
        else:
            env.setdefault(key, s)
        return

    if override_env:
        env[key] = str(value)
    else:
        env.setdefault(key, str(value))


def load_secrets_json_into_environ(*, env: MutableMapping[str, str], secret_path: str) -> None:
    """Load a JSON file into env, optionally overriding existing env values."""
    with open(secret_path, "r", encoding="utf-8-sig") as f:
        config_data = json.load(f)

    # Override env vars if explicitly loading via APP_CONFIG_PATH or using env_dev.json
    override_env = bool(env.get("APP_CONFIG_PATH")) or (os.path.basename(secret_path).lower() == "env_dev.json")

    if isinstance(config_data, dict):
        for key, value in config_data.items():
            _set_env_key(env, key=str(key), value=value, override_env=override_env)

    logger.info("Loaded configuration from %s (override_env=%s)", secret_path, override_env)
    if isinstance(config_data, dict):
        logger.debug("Loaded config keys: %s", list(config_data.keys()))

    # If keys are configured, warn about test/live mismatches (do not mutate secrets at runtime).
    clerk_pub = env.get("VITE_CLERK_PUBLISHABLE_KEY", "")
    clerk_sec = env.get("CLERK_SECRET_KEY", "")
    if clerk_pub.startswith("pk_test_") and clerk_sec.startswith("sk_live_"):
        logger.warning("Clerk key mismatch: publishable key is test but secret key is live (fix env config).")
    if clerk_pub.startswith("pk_live_") and clerk_sec.startswith("sk_test_"):
        logger.warning("Clerk key mismatch: publishable key is live but secret key is test (fix env config).")


def require_secrets_for_production(*, env: Mapping[str, str], secret_path: Optional[str]) -> None:
    """Fail fast if production secrets are missing."""
    is_production = env.get("APP_ENV") == "prod"
    if is_production and not secret_path:
        logging.critical(
            "CRITICAL: Production secrets file not found at /secrets/env.json. Application cannot start."
        )
        import sys

        sys.exit(1)


__all__ = [
    "find_secrets_path",
    "load_secrets_json_into_environ",
    "require_secrets_for_production",
]

