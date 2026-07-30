"""Centralized logging configuration for the application."""

import logging
import sys


def configure_logging(level: int = logging.INFO) -> None:
    """Configure root logging handlers/format. Call once at startup."""

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
