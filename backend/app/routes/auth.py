"""Authentication endpoints with Google and GitHub OAuth."""

import json
from urllib.parse import urlencode, urlparse
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse

from ..config import Settings, get_settings
from ..schemas.auth import SignupRequest, LoginRequest, AuthResponse
from ..services.auth import AuthService

router = APIRouter(tags=["auth"])


def get_auth_service(
    request: Request,
) -> AuthService:
    """Dependency to get AuthService from app state."""
    if not hasattr(request.app.state, "auth_service"):
        settings = get_settings()
        request.app.state.auth_service = AuthService(settings)
    return request.app.state.auth_service


@router.get("/auth/google")
async def google_oauth_start(
    auth_service: AuthService = Depends(get_auth_service),
    redirect_uri: Optional[str] = Query(None),
) -> RedirectResponse:
    """Initiate Google OAuth flow."""
    try:
        # State encoding with provider is handled by auth_service
        url = auth_service.get_authorization_url("google")
        return RedirectResponse(url=url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google OAuth not configured: {exc}",
        ) from exc


@router.get("/auth/github")
async def github_oauth_start(
    auth_service: AuthService = Depends(get_auth_service),
    redirect_uri: Optional[str] = Query(None),
) -> RedirectResponse:
    """Initiate GitHub OAuth flow."""
    try:
        # State encoding with provider is handled by auth_service
        url = auth_service.get_authorization_url("github")
        return RedirectResponse(url=url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"GitHub OAuth not configured: {exc}",
        ) from exc


@router.get("/auth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
    provider: Optional[str] = Query(None, regex="^(google|github)$"),
    auth_service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Handle OAuth callback and return user token."""
    # Extract provider from state if not provided in query
    if not provider and state:
        decoded_state = auth_service._decode_state(state)
        if decoded_state:
            provider = decoded_state.get("provider")

    # Fallback to google if still not determined
    if not provider:
        provider = "google"

    # Validate provider
    if provider not in ["google", "github"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider",
        )

    try:
        result = await auth_service.handle_oauth_callback(
            provider, code, state
        )
        # Redirect to frontend with token
        # Use explicit frontend_url if available, otherwise derive from
        # redirect_uri
        if hasattr(settings, "frontend_url") and settings.frontend_url:
            frontend_base = settings.frontend_url.rstrip("/")
        else:
            # Fallback: extract from redirect_uri
            redirect_uri = settings.oauth_redirect_uri
            parsed = urlparse(redirect_uri)

            # Build frontend URL - ensure it goes to frontend, not backend
            if "/api/auth/callback" in redirect_uri:
                # Replace callback path with base URL
                frontend_base = redirect_uri.replace("/api/auth/callback", "")
            else:
                # Use parsed netloc
                netloc = parsed.netloc
                if ":8000" in netloc:
                    netloc = netloc.replace(":8000", ":5173")
                elif "localhost" in netloc and ":" not in netloc:
                    netloc = "localhost:5173"
                frontend_base = f"{parsed.scheme}://{netloc}"

            # Ensure we're not pointing to backend
            if ":8000" in frontend_base:
                frontend_base = frontend_base.replace(":8000", ":5173")

        frontend_url = f"{frontend_base}/signin"

        token = result["token"]
        user_data = {
            "id": result["user"]["id"],
            "email": result["user"]["email"],
            "name": result["user"].get("name"),
            "picture": result["user"].get("picture"),
            "plan": result["user"].get("plan", "free"),
        }
        # Store token and user in URL query params
        user_json = json.dumps(user_data)
        params = urlencode({"token": token, "user": user_json})
        redirect_url = f"{frontend_url}?{params}"
        return RedirectResponse(url=redirect_url)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth callback failed: {str(exc)}",
        ) from exc


@router.post("/auth/logout")
async def logout(
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    """Logout user - invalidate token on server side."""
    # In a production app, you'd invalidate the token in a blacklist/redis
    # For now, we'll just return success
    # The token will naturally expire based on JWT expiration
    return {"message": "Logged out successfully"}


@router.get("/auth/me")
async def get_current_user(
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    """Get current authenticated user info."""
    # Extract token from Authorization header
    authorization = request.headers.get("Authorization")
    token: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif authorization:
        token = authorization

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    user = await auth_service.verify_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return user


@router.post("/auth/signout")
async def signout() -> dict:
    """Sign out endpoint (client should remove token)."""
    return {"message": "Signed out successfully"}


@router.post("/auth/signup", response_model=AuthResponse)
async def signup(
    request: SignupRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    """Register a new user with email and password."""
    try:
        result = await auth_service.register_user(
            email=request.email,
            password=request.password,
            name=request.name,
        )
        return AuthResponse(
            access_token=result["token"],
            token_type="bearer",
            user={
                "id": result["user"]["id"],
                "email": result["user"]["email"],
                "name": result["user"].get("name"),
                "plan": result["user"].get("plan", "free"),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {str(exc)}",
        ) from exc


@router.post("/auth/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    """Authenticate user with email and password."""
    try:
        result = await auth_service.authenticate_user(
            email=request.email,
            password=request.password,
        )
        return AuthResponse(
            access_token=result["token"],
            token_type="bearer",
            user={
                "id": result["user"]["id"],
                "email": result["user"]["email"],
                "name": result["user"].get("name"),
                "plan": result["user"].get("plan", "free"),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(exc)}",
        ) from exc
