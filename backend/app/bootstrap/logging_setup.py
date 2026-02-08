"""Bootstrap: logging configuration."""

from __future__ import annotations

import logging

from ..utils.runtime_env import is_dev_env


class FilterImageRequests(logging.Filter):
    def filter(self, record):
        """Suppress log records of successful image GET requests."""
        msg = record.getMessage()
        return not ("GET /image/" in msg and " 200 " in msg)


def configure_logging() -> int:
    log_level = logging.DEBUG if is_dev_env() else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    return log_level


def configure_werkzeug_filtering() -> None:
    werkzeug_logger = logging.getLogger("werkzeug")
    werkzeug_logger.addFilter(FilterImageRequests())


__all__ = ["configure_logging", "configure_werkzeug_filtering", "FilterImageRequests"]

