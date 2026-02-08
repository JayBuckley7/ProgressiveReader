"""Bootstrap: composition root wiring (container + blueprint registration)."""

from __future__ import annotations

from typing import Mapping, Any


def wire_container(app, *, env: Mapping[str, str]) -> None:
    from ..container import create_container
    from ..settings import load_settings
    from ..infrastructure.sqlalchemy.db import db

    settings = load_settings(env=env, flask_config=app.config)
    app.extensions["container"] = create_container(settings=settings, db_session=db.session)


def register_domain_blueprints(app) -> None:
    from ..domains.translation.routes import translation_bp
    from ..domains.vocabulary.routes import vocabulary_bp
    from ..domains.kanji.routes import kanji_bp
    from ..domains.books.routes import books_bp
    from ..domains.grammar.routes import grammar_bp
    from ..domains.mix.routes import mix_bp
    from ..domains.admin.routes import admin_bp
    from ..domains.auth.routes import auth_bp
    from ..domains.drive import drive_bp as drive_domain_bp
    from ..domains.ocr.routes import ocr_bp

    app.register_blueprint(translation_bp)
    app.register_blueprint(vocabulary_bp)
    app.register_blueprint(kanji_bp)
    app.register_blueprint(books_bp)
    app.register_blueprint(grammar_bp)
    app.register_blueprint(mix_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(drive_domain_bp)
    app.register_blueprint(ocr_bp)


__all__ = ["wire_container", "register_domain_blueprints"]

