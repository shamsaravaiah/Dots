"""Firestore client factory."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


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
    """Return a cached Firestore client."""
    # Ensure Firebase is initialized
    initialize_firebase()

    # Return Firestore client
    return firestore.client()
