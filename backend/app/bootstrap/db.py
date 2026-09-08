"""Bootstrap: database configuration and initialization."""

from __future__ import annotations

import os

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError


def configure_sqlalchemy(app) -> None:
    # Database configuration (production should use a durable backend)
    db_path = os.path.join(app.instance_path, "app.db")
    app.config.setdefault("SQLALCHEMY_DATABASE_URI", f"sqlite:///{db_path}")
    app.config.setdefault("SQLALCHEMY_TRACK_MODIFICATIONS", False)
    os.makedirs(app.instance_path, exist_ok=True)


def init_db(app, db) -> None:
    db.init_app(app)


def create_tables(app, db) -> None:
    with app.app_context():
        db.create_all()
        migrate_bookmark_locator(db.engine)


def migrate_bookmark_locator(engine) -> None:
    """Add the optional bookmark locator column to pre-existing databases."""
    inspector = inspect(engine)
    if "bookmark" not in inspector.get_table_names():
        return
    if "locator_json" in {column["name"] for column in inspector.get_columns("bookmark")}:
        return

    try:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE bookmark ADD COLUMN locator_json TEXT NULL"))
    except SQLAlchemyError:
        # Multiple startup workers can observe the old schema at the same time.
        # Only suppress a racing duplicate-column failure after verifying success.
        refreshed = inspect(engine)
        if "locator_json" not in {column["name"] for column in refreshed.get_columns("bookmark")}:
            raise


__all__ = ["configure_sqlalchemy", "init_db", "create_tables", "migrate_bookmark_locator"]

