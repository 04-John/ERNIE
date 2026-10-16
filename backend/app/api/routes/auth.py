"""
Auth Routes
===========
POST /auth/register  — create new account
POST /auth/login     — email/password login → JWT
POST /auth/google    — Google OAuth → JWT
GET  /auth/me        — get current user from token
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, status
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
    rate_limit_key, issue_auth_token, consume_auth_token, set_password, link_google_account,
)
from app.services import email as mailer
from app.models.organization import Organization
from app.services.tenancy import find_valid_invite, mark_invite_accepted

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
    invite_token: Optional[str] = Field(default=None, max_length=200)

class ForgotRequest(BaseModel):
    email: EmailStr

class ResetRequest(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=128)

class TokenRequest(BaseModel):
    token: str = Field(max_length=200)

class LoginRequest(BaseModel):
    email:    str = Field(max_length=254)
    password: str = Field(max_length=128)

class GoogleAuthRequest(BaseModel):
    access_token: str = Field(max_length=4096)  # Google OAuth access token from frontend
    invite_token: Optional[str] = Field(default=None, max_length=200)

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user: dict


# ─────────────────────────────────────────────
# REGISTER
# ─────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, dependencies=[Depends(rate_limit_auth)])
def register(req: RegisterRequest, background: BackgroundTasks, db: Session = Depends(get_db)):
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

    # joining via invite: the invite decides the workspace and role, and may be bound to one email
    invite = None
    if req.invite_token:
        invite = find_valid_invite(db, req.invite_token)
        if not invite:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invitation is invalid or has expired.")
        if invite.email and invite.email != req.email.strip().lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invitation was sent to a different email address.")

    user = create_user(
        db=db,
        email=req.email,
        name=req.name,
        company=req.company,
        password=req.password,
        org_id=invite.org_id if invite else None,
        role=invite.role if invite else "admin",
    )
    if invite:
        mark_invite_accepted(db, invite)

    if mailer.email_enabled():
        subject, text, html = mailer.verify_email(f"{settings.app_base_url}/?verify={issue_auth_token(db, user, 'verify')}")
        background.add_task(mailer.send_email, user.email, subject, text, html)

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
            # existing email account: link Google (email is Google-verified); see link_google_account()
            link_google_account(db, user, google_id)
        else:
            invite = find_valid_invite(db, req.invite_token) if req.invite_token else None
            if req.invite_token and not invite:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invitation is invalid or has expired.")
            if invite and invite.email and invite.email != email.strip().lower():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invitation was sent to a different Google account.")
            user = create_user(
                db=db, email=email, name=name, google_id=google_id,
                org_id=invite.org_id if invite else None,
                role=invite.role if invite else "admin",
            )
            if invite:
                mark_invite_accepted(db, invite)

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
        "is_verified":   user.is_verified,
        "email_enabled": mailer.email_enabled(),
        "workspace":  org.name if org else None,
        "role":       user.role,
        "id":         user.id,
        "email":      user.email,
        "name":       user.name,
        "company":    user.company,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


# ─────────────────────────────────────────────
# INVITE PREVIEW (public: lets the signup page show who invited you)
# ─────────────────────────────────────────────

@router.get("/invite/{token}", dependencies=[Depends(rate_limit_auth)])
def preview_invite(token: str, db: Session = Depends(get_db)):
    invite = find_valid_invite(db, token)
    if not invite:
        raise HTTPException(status_code=404, detail="This invitation is invalid or has expired.")
    org = db.query(Organization).filter(Organization.id == invite.org_id).first()
    return {"workspace": org.name if org else "a workspace", "email": invite.email, "role": invite.role}


# ─────────────────────────────────────────────
# PASSWORD RESET
# ─────────────────────────────────────────────

GENERIC_RESET_REPLY = {"message": "If an account exists for that email, a reset link is on its way."}


@router.post("/forgot-password", dependencies=[Depends(rate_limit_auth)])
def forgot_password(req: ForgotRequest, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Always answers the same way, so it can't be used to discover which emails have accounts."""
    email = req.email.strip().lower()
    user = get_user_by_email(db, email)
    # at most 3 emails per address per hour, so a victim's inbox can't be flooded
    if user and user.is_active and rate_limit_key(f"reset:{email}", 3, 3600):
        link = f"{settings.app_base_url}/?reset={issue_auth_token(db, user, 'reset')}"
        subject, text, html = mailer.reset_email(link)
        background.add_task(mailer.send_email, user.email, subject, text, html)
    return GENERIC_RESET_REPLY


@router.post("/reset-password", dependencies=[Depends(rate_limit_auth)])
def reset_password(req: ResetRequest, db: Session = Depends(get_db)):
    if len(req.password) < MIN_PASSWORD_LENGTH:                      # checked first so a typo doesn't burn the link
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    user = consume_auth_token(db, req.token, "reset")
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    set_password(db, user, req.password)
    return {"message": "Password updated. You can sign in with it now."}


# ─────────────────────────────────────────────
# EMAIL VERIFICATION
# ─────────────────────────────────────────────

@router.post("/verify-email", dependencies=[Depends(rate_limit_auth)])
def verify_email(req: TokenRequest, db: Session = Depends(get_db)):
    user = consume_auth_token(db, req.token, "verify")
    if not user:
        raise HTTPException(status_code=400, detail="This confirmation link is invalid or has expired.")
    user.is_verified = True
    db.commit()
    return {"message": "Email confirmed."}


@router.post("/resend-verification")
def resend_verification(background: BackgroundTasks, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.is_verified:
        return {"sent": False, "message": "Your email is already confirmed."}
    if not mailer.email_enabled():
        return {"sent": False, "message": "Email isn't configured on this server."}
    if not rate_limit_key(f"verify:{user.id}", 3, 3600):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    subject, text, html = mailer.verify_email(f"{settings.app_base_url}/?verify={issue_auth_token(db, user, 'verify')}")
    background.add_task(mailer.send_email, user.email, subject, text, html)
    return {"sent": True, "message": "Confirmation email sent."}
