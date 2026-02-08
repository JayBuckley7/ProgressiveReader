"""App package entrypoints."""

from __future__ import annotations

from .bootstrap.app_factory import create_app

__all__ = ["create_app"]

