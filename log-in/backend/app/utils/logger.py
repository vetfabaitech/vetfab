"""Thin wrapper so callers don't reach for stdlib `logging` directly --
mirrors ../../../backend/app/utils/logger.py's shape. uvicorn already
configures root handlers/format for this service, so there's no
`configure_logging()` here (nothing else to set up)."""

import logging


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
