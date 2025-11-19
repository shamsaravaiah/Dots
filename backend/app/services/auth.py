"""OAuth authentication service with Firestore user management."""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi.concurrency import run_in_threadpool
from jose import jwt
from passlib.context import CryptContext

from ..config import Settings
from ..services.firestore import get_firestore_client

logger = logging.getLogger("dots.auth")

# OAuth provider endpoints
GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USERINFO_URL = "https://api.github.com/user"


class AuthService:
    """Handles OAuth flows and user management in Firestore."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._db = get_firestore_client()
        self._pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    def create_oauth_client(
        self,
        provider: str,
        redirect_uri: Optional[str] = None,
    ) -> AsyncOAuth2Client:
        """Create an OAuth2 client for the specified provider."""
        if provider == "google":
            if not self._settings.google_client_id:
                raise ValueError("Google OAuth not configured")
            return AsyncOAuth2Client(
                client_id=self._settings.google_client_id,
                client_secret=self._settings.google_client_secret,
                redirect_uri=redirect_uri or self._settings.oauth_redirect_uri,
            )
        elif provider == "github":
            if not self._settings.github_client_id:
                raise ValueError("GitHub OAuth not configured")
            return AsyncOAuth2Client(
                client_id=self._settings.github_client_id,
                client_secret=self._settings.github_client_secret,
                redirect_uri=redirect_uri or self._settings.oauth_redirect_uri,
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")

    def _encode_state(self, provider: str, token: str) -> str:
        """Encode provider and token into state parameter."""
        state_data = {"provider": provider, "token": token}
        state_json = json.dumps(state_data)
        encoded = base64.urlsafe_b64encode(state_json.encode()).decode()
        return encoded.rstrip("=")

    def _decode_state(self, state: str) -> Optional[Dict[str, str]]:
        """Decode state parameter to extract provider and token."""
        try:
            # Add padding if needed
            padding = 4 - len(state) % 4
            if padding != 4:
                state += "=" * padding
            decoded = base64.urlsafe_b64decode(state.encode())
            return json.loads(decoded)
        except Exception:
            return None

    def get_authorization_url(
        self,
        provider: str,
        state: Optional[str] = None,
    ) -> str:
        """Generate OAuth URL with provider encoded in state."""
        import secrets

        # If state provided, use it; otherwise generate and encode
        if state:
            # If state is already encoded, use it as-is
            decoded = self._decode_state(state)
            if decoded and decoded.get("provider") == provider:
                encoded_state = state
            else:
                # Re-encode with provider
                token = decoded.get("token", state) if decoded else state
                encoded_state = self._encode_state(provider, token)
        else:
            token = secrets.token_urlsafe(32)
            encoded_state = self._encode_state(provider, token)

        client = self.create_oauth_client(provider)
        if provider == "google":
            url, _ = client.create_authorization_url(
                GOOGLE_AUTHORIZE_URL,
                scope="openid email profile",
                state=encoded_state,
            )
            return url
        elif provider == "github":
            url, _ = client.create_authorization_url(
                GITHUB_AUTHORIZE_URL,
                scope="user:email",
                state=encoded_state,
            )
            return url
        raise ValueError(f"Unknown provider: {provider}")

    async def handle_oauth_callback(
        self,
        provider: str,
        code: str,
        state: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Exchange OAuth code for token and fetch user info."""
        client = self.create_oauth_client(provider)

        if provider == "google":
            token_url = GOOGLE_TOKEN_URL
            userinfo_url = GOOGLE_USERINFO_URL
        elif provider == "github":
            token_url = GITHUB_TOKEN_URL
            userinfo_url = GITHUB_USERINFO_URL
        else:
            raise ValueError(f"Unknown provider: {provider}")

        # Use client within context manager for all operations
        async with client:
            # Exchange code for token
            token = await client.fetch_token(token_url, code=code)

            # Fetch user info
            resp = await client.get(userinfo_url)
            resp.raise_for_status()
            userinfo = resp.json()

            # GitHub may need separate email API call
            if provider == "github" and not userinfo.get("email"):
                # Try to get primary email from emails endpoint
                email_url = "https://api.github.com/user/emails"
                email_resp = await client.get(email_url)
                if email_resp.status_code == 200:
                    emails = email_resp.json()
                    primary = next(
                        (e for e in emails if e.get("primary")),
                        emails[0] if emails else None,
                    )
                    if primary:
                        userinfo["email"] = primary.get("email")

        # Normalize user data
        if provider == "google":
            user_data = {
                "email": userinfo.get("email"),
                "name": userinfo.get("name"),
                "picture": userinfo.get("picture"),
                "provider": "google",
                "provider_id": userinfo.get("id"),
            }
        else:  # github
            user_data = {
                "email": userinfo.get("email"),
                "name": userinfo.get("name") or userinfo.get("login"),
                "picture": userinfo.get("avatar_url"),
                "provider": "github",
                "provider_id": str(userinfo.get("id")),
            }

        # Create or update user in Firestore
        user = await self._upsert_user(user_data)

        # Generate JWT token
        token = self._generate_jwt_token(
            user["id"], user["email"], user["plan"]
        )

        return {
            "user": user,
            "token": token,
        }

    async def _upsert_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update user in Firestore."""
        email = user_data.get("email")
        provider = user_data.get("provider")
        provider_id = user_data.get("provider_id")

        if not email or not provider or not provider_id:
            raise ValueError("Missing required user data")

        # Check if user exists by email or provider_id
        def _query_user():
            users_ref = self._db.collection("users")
            query = users_ref.where("email", "==", email).limit(1)
            return list(query.stream())

        existing_docs = await run_in_threadpool(_query_user)

        now = datetime.utcnow()
        user_id: str
        user_doc: Dict[str, Any]

        if existing_docs:
            # Update existing user
            doc = existing_docs[0]
            user_id = doc.id
            user_doc = doc.to_dict() or {}
            user_doc.update(
                {
                    "email": email,
                    "name": user_data.get("name"),
                    "picture": user_data.get("picture"),
                    "provider": provider,
                    "provider_id": provider_id,
                    "updated_at": now,
                    "last_login_at": now,
                }
            )
            # Preserve plan if it exists, otherwise default to "free"
            if "plan" not in user_doc:
                user_doc["plan"] = "free"
        else:
            # Create new user
            def _create_doc_id():
                return self._db.collection("users").document().id

            user_id = await run_in_threadpool(_create_doc_id)
            user_doc = {
                "id": user_id,
                "email": email,
                "name": user_data.get("name"),
                "picture": user_data.get("picture"),
                "provider": provider,
                "provider_id": provider_id,
                "plan": "free",  # Default plan
                "created_at": now,
                "updated_at": now,
                "last_login_at": now,
            }

        # Save to Firestore
        def _save_user():
            self._db.collection("users").document(user_id).set(
                user_doc, merge=True
            )

        await run_in_threadpool(_save_user)

        return user_doc

    def _generate_jwt_token(
        self,
        user_id: str,
        email: str,
        plan: str,
    ) -> str:
        """Generate JWT token for authenticated user."""
        expiration = datetime.utcnow() + timedelta(
            hours=self._settings.jwt_expiration_hours
        )
        payload = {
            "sub": user_id,
            "email": email,
            "plan": plan,
            "exp": expiration,
            "iat": datetime.utcnow(),
        }
        return jwt.encode(
            payload,
            self._settings.jwt_secret,
            algorithm=self._settings.jwt_algorithm,
        )

    async def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT token and return user data."""
        try:
            payload = jwt.decode(
                token,
                self._settings.jwt_secret,
                algorithms=[self._settings.jwt_algorithm],
            )
            user_id = payload.get("sub")
            if not user_id:
                return None

            # Fetch user from Firestore
            def _get_user():
                doc = self._db.collection("users").document(user_id).get()
                return doc.to_dict() if doc.exists else None

            user_data = await run_in_threadpool(_get_user)
            if not user_data:
                return None
            return {
                "id": user_id,
                "email": user_data.get("email"),
                "plan": user_data.get("plan", "free"),
                "name": user_data.get("name"),
            }
        except Exception as exc:
            logger.warning("Token verification failed: %s", exc)
            return None

    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Fetch user from Firestore by ID."""
        def _get_user():
            doc = self._db.collection("users").document(user_id).get()
            return doc.to_dict() if doc.exists else None

        return await run_in_threadpool(_get_user)

    def _hash_password(self, password: str) -> str:
        """Hash a password using bcrypt (max 72 bytes)."""
        # Bcrypt has a 72-byte limit, so truncate if necessary
        password_bytes = password.encode('utf-8')
        if len(password_bytes) > 72:
            # Truncate to 72 bytes, handling UTF-8 boundaries
            truncated = password_bytes[:72]
            # Try to decode, but if it fails at the boundary, remove last byte
            try:
                password = truncated.decode('utf-8')
            except UnicodeDecodeError:
                password = truncated[:-1].decode('utf-8')
        return self._pwd_context.hash(password)

    def _verify_password(
        self, plain_password: str, hashed_password: str
    ) -> bool:
        """Verify a password against a hash."""
        # Truncate password to 72 bytes if necessary (same as hashing)
        password_bytes = plain_password.encode('utf-8')
        if len(password_bytes) > 72:
            truncated = password_bytes[:72]
            try:
                plain_password = truncated.decode('utf-8')
            except UnicodeDecodeError:
                plain_password = truncated[:-1].decode('utf-8')
        return self._pwd_context.verify(plain_password, hashed_password)

    async def register_user(
        self,
        email: str,
        password: str,
        name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register a new user with email and password."""
        if not email or not password:
            raise ValueError("Email and password are required")

        # Check if user already exists
        def _query_user():
            users_ref = self._db.collection("users")
            query = users_ref.where("email", "==", email).limit(1)
            return list(query.stream())

        existing_docs = await run_in_threadpool(_query_user)
        if existing_docs:
            raise ValueError("User with this email already exists")

        # Hash password
        hashed_password = self._hash_password(password)

        # Create new user
        def _create_doc_id():
            return self._db.collection("users").document().id

        user_id = await run_in_threadpool(_create_doc_id)
        now = datetime.utcnow()

        user_doc = {
            "id": user_id,
            "email": email,
            "name": name or email.split("@")[0],
            "password_hash": hashed_password,
            "provider": "email",
            "provider_id": email,  # Use email as provider_id for email users
            "plan": "free",
            "created_at": now,
            "updated_at": now,
            "last_login_at": now,
        }

        # Save to Firestore
        def _save_user():
            self._db.collection("users").document(user_id).set(user_doc)

        await run_in_threadpool(_save_user)

        # Generate JWT token
        token = self._generate_jwt_token(user_id, email, "free")

        return {
            "user": user_doc,
            "token": token,
        }

    async def authenticate_user(
        self,
        email: str,
        password: str,
    ) -> Dict[str, Any]:
        """Authenticate a user with email and password."""
        if not email or not password:
            raise ValueError("Email and password are required")

        # Find user by email
        def _query_user():
            users_ref = self._db.collection("users")
            query = users_ref.where("email", "==", email).limit(1)
            return list(query.stream())

        existing_docs = await run_in_threadpool(_query_user)
        if not existing_docs:
            raise ValueError("Invalid email or password")

        doc = existing_docs[0]
        user_doc = doc.to_dict() or {}
        user_id = doc.id

        # Check if user has password (email provider)
        password_hash = user_doc.get("password_hash")
        if not password_hash:
            raise ValueError("Invalid email or password")

        # Verify password
        if not self._verify_password(password, password_hash):
            raise ValueError("Invalid email or password")

        # Update last login
        now = datetime.utcnow()
        user_doc["last_login_at"] = now
        user_doc["updated_at"] = now

        def _update_user():
            self._db.collection("users").document(user_id).update(
                {"last_login_at": now, "updated_at": now}
            )

        await run_in_threadpool(_update_user)

        # Generate JWT token
        token = self._generate_jwt_token(
            user_id, email, user_doc.get("plan", "free")
        )

        # Remove password hash from response
        user_response = {
            k: v for k, v in user_doc.items() if k != "password_hash"
        }

        return {
            "user": user_response,
            "token": token,
        }
