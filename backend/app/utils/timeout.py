from __future__ import annotations

from dataclasses import dataclass



@dataclass(frozen=True)
class TimeoutExceededError(RuntimeError):
    """Raised when a callable doesn't return within the requested timeout."""

    label: str
    timeout_seconds: float

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.label} timed out after {self.timeout_seconds:.1f}s"

