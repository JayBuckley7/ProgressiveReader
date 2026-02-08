"""Flask application factory.

This module lives in bootstrap/ so the domains remain framework-agnostic.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from dotenv import load_dotenv

from ..utils.runtime_env import is_dev_env, is_test_env
from .logging_setup import configure_logging, configure_werkzeug_filtering
from .secrets import find_secrets_path, load_secrets_json_into_environ, require_secrets_for_production
from .web import configure_cors, register_spa_routes, register_health_route
from .db import configure_sqlalchemy, init_db, create_tables
from .wiring import wire_container, register_domain_blueprints
from ..infrastructure.sqlalchemy.db import db

if TYPE_CHECKING:
    from flask import Flask


def create_app(config_class=None) -> Flask:
    from flask import Flask

    load_dotenv()

    log_level = configure_logging()

    # Load additional configuration from a mounted secret if available.
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    secret_path = find_secrets_path(env=os.environ, root_dir=root_dir, backend_dir=backend_dir, is_dev=is_dev_env())
    require_secrets_for_production(env=os.environ, secret_path=secret_path)
    if secret_path:
        try:
            load_secrets_json_into_environ(env=os.environ, secret_path=secret_path)
        except Exception as e:
            logging.error("Failed to load secrets from %s: %s", secret_path, e)
            import traceback

            logging.error("Traceback: %s", traceback.format_exc())
            is_production = os.getenv("APP_ENV") == "prod"
            if is_production and secret_path == "/secrets/env.json":
                logging.critical("CRITICAL: Failed to load production secrets. Application cannot start.")
                import sys

                sys.exit(1)

    # Import Config after env is loaded, so env-backed class attributes aren't frozen early.
    if config_class is None:
        from config import Config as _DefaultConfig

        config_class = _DefaultConfig

    app = Flask(
        __name__,
        static_folder="static",  # points at backend/app/static
        static_url_path="",  # serve at /
    )

    configure_cors(app)

    app.config.from_object(config_class)
    if is_test_env():
        # Enable translation routes in unit tests without requiring real secrets.
        app.config.setdefault("OPENAI_API_KEY", "test-key")

    configure_sqlalchemy(app)
    init_db(app, db)

    app.logger.setLevel(log_level)
    logging.getLogger("app.utils.clerk_auth").setLevel(log_level)
    configure_werkzeug_filtering()

    register_spa_routes(app)
    register_health_route(app, env=os.environ)

    with app.app_context():
        wire_container(app, env=os.environ)
        register_domain_blueprints(app)
        create_tables(app, db)

    app.logger.info("Flask app created successfully.")
    return app


__all__ = ["create_app"]

