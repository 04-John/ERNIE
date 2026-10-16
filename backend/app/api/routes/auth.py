"""
Auth Routes
===========
POST /auth/register  — create new account
POST /auth/login     — email/password login → JWT
POST /auth/google    — Google OAuth → JWT
GET  /auth/me        — get current user from token
"""

from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import User
from app.services.auth import (
    create_access_token, get_current_user, rate_limit_auth,
    get_user_by_email, get_user_by_google_id,
    create_user, authenticate_user, update_last_login,
    MIN_PASSWORD_LENGTH,
)

settings = get_settings()

router = APIRouter()


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    name:     Optional[str] = Field(default="", max_length=120)
    company:  Optional[str] = Field(default="", max_length=120)

class LoginRequest(BaseModel):
    email:    str = Field(max_length=254)
    password: str = Field(max_length=128)

class GoogleAuthRequest(BaseModel):
    access_token: str = Field(max_length=4096)  # Google OAuth access token from frontend

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user: dict


# ─────────────────────────────────────────────
# REGISTER
# ─────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, dependencies=[Depends(rate_limit_auth)])
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # check if email already exists
    if get_user_by_email(db, req.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    if len(req.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters."
        )

    user = create_user(
        db=db,
        email=req.email,
        name=req.name,
        company=req.company,
        password=req.password,
    )

    token = create_access_token({"sub": user.id, "email": user.email})
    update_last_login(db, user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id":      user.id,
            "email":   user.email,
            "name":    user.name,
            "company": user.company,
        }
    }


# ─────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit_auth)])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.email, req.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    token = create_access_token({"sub": user.id, "email": user.email})
    update_last_login(db, user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id":      user.id,
            "email":   user.email,
            "name":    user.name,
            "company": user.company,
        }
    }


# ─────────────────────────────────────────────
# GOOGLE AUTH
# ─────────────────────────────────────────────

@router.post("/google", response_model=TokenResponse, dependencies=[Depends(rate_limit_auth)])
async def google_auth(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Receives a Google access token from the frontend, verifies it was issued
    for OUR client id (prevents tokens minted for other apps being replayed),
    fetches the profile, creates/finds the user and returns our JWT.
    """
    import httpx

    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured.",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            info = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"access_token": req.access_token},
            )
            info.raise_for_status()
            token_info = info.json()

            if token_info.get("aud") != settings.google_client_id:
                raise ValueError("token audience mismatch")

            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {req.access_token}"},
            )
            resp.raise_for_status()
            google_user = resp.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token."
        )

    google_id = google_user.get("sub")
    email     = google_user.get("email")
    name      = google_user.get("name", "")

    if not email or not google_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from Google."
        )
    if not google_user.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your Google email address is not verified."
        )

    # find or create user
    user = get_user_by_google_id(db, google_id)
    if not user:
        user = get_user_by_email(db, email)
        if user:
            # existing email account — link Google (email is Google-verified)
            user.google_id   = google_id
            user.is_verified = True
            db.commit()
        else:
            user = create_user(db=db, email=email, name=name, google_id=google_id)

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled.")

    token = create_access_token({"sub": user.id, "email": user.email})
    update_last_login(db, user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id":      user.id,
            "email":   user.email,
            "name":    user.name or name,
            "company": user.company,
        }
    }


# ─────────────────────────────────────────────
# GET CURRENT USER
# ─────────────────────────────────────────────

@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.organization import Organization
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    return {
        "workspace":  org.name if org else None,
        "role":       user.role,
        "id":         user.id,
        "email":      user.email,
        "name":       user.name,
        "company":    user.company,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }
