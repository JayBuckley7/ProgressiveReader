from __future__ import annotations

import queue
import threading
from dataclasses import dataclass
from typing import Callable, Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class TimeoutExceededError(RuntimeError):
    """Raised when a callable doesn't return within the requested timeout."""

    label: str
    timeout_seconds: float

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.label} timed out after {self.timeout_seconds:.1f}s"


class _Result(Generic[T]):
    __slots__ = ("value", "error")

    def __init__(self, value: T | None = None, error: BaseException | None = None) -> None:
        self.value = value
        self.error = error


def call_with_timeout(label: str, timeout_seconds: float, fn: Callable[[], T]) -> T:
    """
    Execute `fn` in a daemon thread and return its result, raising on timeout.

    Notes:
    - This is a best-effort timeout guard for libraries that don't expose request timeouts.
    - The underlying work cannot be force-cancelled; we run it in a daemon thread so it
      won't block process shutdown.
    """
    q: queue.Queue[_Result[T]] = queue.Queue(maxsize=1)

    def _run() -> None:
        try:
            q.put(_Result(value=fn()))
        except BaseException as e:  # noqa: BLE001 - this is a boundary wrapper
            q.put(_Result(error=e))

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    try:
        res = q.get(timeout=timeout_seconds)
    except queue.Empty as e:
        raise TimeoutExceededError(label=label, timeout_seconds=timeout_seconds) from e

    if res.error is not None:
        raise res.error
    return res.value  # type: ignore[return-value]

