"""Drive domain errors (used to keep routes thin)."""

from __future__ import annotations


class DriveProviderNotConfiguredError(RuntimeError):
    pass


class GoogleNotConnectedError(RuntimeError):
    pass


__all__ = ["DriveProviderNotConfiguredError", "GoogleNotConnectedError"]

