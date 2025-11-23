"""Firestore client factory."""

from __future__ import annotations

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

    # Get the path to the service account JSON file
    cred_path = None

    # Option 1: Use environment variable if it exists and file is valid
    env_cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if env_cred_path and Path(env_cred_path).exists():
        cred_path = env_cred_path

    # Option 2: Use default path relative to backend directory
    if not cred_path:
        backend_dir = Path(__file__).parent.parent.parent
        cred_file = (
            "dots-app-backend-firebase-adminsdk-fbsvc-956b80c207.json"
        )
        default_path = backend_dir / cred_file
        if default_path.exists():
            cred_path = str(default_path)

    # Initialize Firebase Admin SDK
    if cred_path:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    else:
        # Calculate default path for error message
        backend_dir = Path(__file__).parent.parent.parent
        cred_file = (
            "dots-app-backend-firebase-adminsdk-fbsvc-956b80c207.json"
        )
        default_path = backend_dir / cred_file
        raise RuntimeError(
            "Firebase credentials not found. "
            f"Please ensure the credentials file exists at: {default_path} "
            "or set GOOGLE_APPLICATION_CREDENTIALS environment variable "
            "to a valid credentials file path."
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
