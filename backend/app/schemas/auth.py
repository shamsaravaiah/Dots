"""Authentication request/response schemas."""

from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    """Signup request schema."""

    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    """Login request schema."""

    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    """Authentication response schema."""

    access_token: str
    token_type: str = "bearer"
    user: dict
