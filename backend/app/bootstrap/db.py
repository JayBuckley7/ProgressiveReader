"""Bootstrap: database configuration and initialization."""

from __future__ import annotations

import os


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


__all__ = ["configure_sqlalchemy", "init_db", "create_tables"]

