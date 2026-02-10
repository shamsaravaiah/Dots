"""Firestore client factory."""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache, wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import retry as retry_lib
from google.api_core.exceptions import (
    DeadlineExceeded,
    InternalServerError,
    ServiceUnavailable,
    TooManyRequests,
)

logger = logging.getLogger("dots.firestore")

# Type variable for function return type
F = TypeVar("F", bound=Callable[..., Any])


@lru_cache(maxsize=1)
def initialize_firebase() -> None:
    """Initialize Firebase Admin SDK with service account credentials."""
    # Check if Firebase is already initialized
    if firebase_admin._apps:
        return

    cred = None
    env_val = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    # Option 1: GOOGLE_APPLICATION_CREDENTIALS as file path
    if env_val and Path(env_val).exists():
        cred = credentials.Certificate(env_val)

    # Option 2: GOOGLE_APPLICATION_CREDENTIALS as raw JSON (e.g. Render)
    if cred is None and env_val and env_val.strip().startswith("{"):
        try:
            cred_dict = json.loads(env_val)
            cred = credentials.Certificate(cred_dict)
        except (json.JSONDecodeError, TypeError) as e:
            raise RuntimeError(
                "GOOGLE_APPLICATION_CREDENTIALS is set but invalid JSON: "
                f"{e}"
            ) from e

    # Option 3: Default path relative to backend directory
    if cred is None:
        backend_dir = Path(__file__).parent.parent.parent
        cred_file = "dots-app-backend-firebase-adminsdk-fbsvc-956b80c207.json"
        default_path = backend_dir / cred_file
        if default_path.exists():
            cred = credentials.Certificate(str(default_path))

    if cred is not None:
        firebase_admin.initialize_app(cred)
    else:
        backend_dir = Path(__file__).parent.parent.parent
        default_path = backend_dir / "dots-app-backend-firebase-adminsdk-fbsvc-956b80c207.json"
        raise RuntimeError(
            "Firebase credentials not found. "
            f"Ensure a credentials file exists at: {default_path} "
            "or set GOOGLE_APPLICATION_CREDENTIALS to a file path or JSON string."
        )


@lru_cache(maxsize=1)
def get_firestore_client() -> firestore.Client:
    """Return a cached Firestore client.
    
    Timeout configuration can be set via environment variables:
    - GRPC_KEEPALIVE_TIME_MS: Keepalive ping interval (default: 30000ms)
    - GRPC_KEEPALIVE_TIMEOUT_MS: Keepalive timeout (default: 5000ms)
    - GRPC_KEEPALIVE_PERMIT_WITHOUT_CALLS: Allow keepalive without calls
    - GRPC_MAX_RECEIVE_MESSAGE_LENGTH: Max message size (default: 4MB)
    
    These are set at the gRPC level and affect all Firestore operations.
    """
    # Ensure Firebase is initialized
    initialize_firebase()

    # Note: Firestore client timeout is configured at the gRPC level
    # The retry logic in with_firestore_retry handles operation-level timeouts
    # For gRPC-level timeouts, set environment variables before importing:
    # os.environ.setdefault("GRPC_KEEPALIVE_TIME_MS", "30000")
    # os.environ.setdefault("GRPC_KEEPALIVE_TIMEOUT_MS", "5000")
    
    # Return Firestore client
    return firestore.client()


# Configure retry strategy for Firestore operations
# Retries on transient errors with exponential backoff
_firestore_retry = retry_lib.Retry(
    predicate=retry_lib.if_exception_type(
        DeadlineExceeded,
        ServiceUnavailable,
        InternalServerError,
        TooManyRequests,
    ),
    initial=1.0,  # Start with 1 second delay
    maximum=60.0,  # Max 60 seconds between retries
    multiplier=2.0,  # Double the delay each retry
    timeout=300.0,  # Total timeout of 5 minutes
)


def with_firestore_retry(func: F) -> F:
    """Decorator to add retry logic to Firestore operations.
    
    Automatically retries on transient Firestore errors like:
    - DeadlineExceeded (timeouts)
    - ServiceUnavailable (temporary service issues)
    - InternalServerError (server-side errors)
    - TooManyRequests (rate limiting)
    
    Uses exponential backoff to avoid overwhelming the service.
    """
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return _firestore_retry(func)(*args, **kwargs)
        except Exception as e:
            logger.error(
                "Firestore operation failed after retries: %s", e,
                exc_info=True
            )
            raise
    
    return wrapper  # type: ignore
