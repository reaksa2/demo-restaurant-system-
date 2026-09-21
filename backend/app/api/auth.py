import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_scope, get_current_user, oauth2_scheme
from app.core.config import settings
from app.core.security import verify_password, create_access_token, decode_access_token
from app.db.database import get_db
from app.db.models.user import User
from app.db.models.session import UserSession
from app.schemas.auth import LoginRequest, TokenResponse, CurrentUserInfo, MyProfileUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Sentinel "duration" for a never-expiring session — a token/session that
# genuinely never expires isn't representable, so we use a lifetime far
# beyond any realistic device lifespan instead. Ends only when an admin
# revokes that device or the account's max_devices cap evicts it.
NEVER_EXPIRE_LIFETIME = timedelta(days=365 * 100)


def _client_ip(request: Request) -> str | None:
    """
    Render (and most PaaS hosts) put the app behind a reverse proxy, so the
    real client IP arrives in X-Forwarded-For, not request.client — that
    would otherwise just show the proxy's own address for every device.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Accepts either the account's email or its (optional) username in the
    # same field — whichever matches.
    user = db.query(User).filter(or_(User.email == payload.identifier, User.username == payload.identifier)).first()
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email/username or password")

    # Drop any of this user's sessions whose token has already expired
    # (e.g. a browser closed without logging out) before counting devices —
    # otherwise a dead session neither the JWT nor the person can still use
    # keeps occupying a max_devices slot forever, and a genuinely active
    # device could get evicted to make room for it. Never-expiring sessions
    # (expires_at IS NULL) are never touched here.
    now = datetime.utcnow()
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.expires_at.isnot(None),
        UserSession.expires_at < now,
    ).delete()

    # Configurable multi-device login: this device gets its own session row.
    # If that still puts the user over their configured max_devices, the
    # oldest/least-recently-logged-in device(s) are signed out to make room —
    # the newest login always succeeds. An account with never_expire set
    # gets both a NULL-expiry session row and a JWT with a century-long
    # lifetime, so it's never signed out just by the clock.
    session_id = uuid.uuid4().hex
    token_lifetime = NEVER_EXPIRE_LIFETIME if user.never_expire else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expires_at = None if user.never_expire else now + token_lifetime
    db.add(
        UserSession(
            user_id=user.id,
            session_id=session_id,
            expires_at=expires_at,
            user_agent=(request.headers.get("user-agent") or "")[:500] or None,
            ip_address=_client_ip(request),
            last_seen_at=now,
        )
    )
    db.flush()

    max_devices = max(user.max_devices or 1, 1)
    existing_sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id)
        .order_by(UserSession.created_at.asc())
        .all()
    )
    if len(existing_sessions) > max_devices:
        for stale in existing_sessions[: len(existing_sessions) - max_devices]:
            db.delete(stale)

    db.commit()

    token = create_access_token(
        {"sub": str(user.id), "role": user.role.value, "sid": session_id},
        expires_delta=token_lifetime,
    )
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Signs out only THIS device, immediately — other devices this account is logged into are untouched."""
    payload = decode_access_token(token)
    session_id = payload.get("sid") if payload else None
    if session_id:
        db.query(UserSession).filter(
            UserSession.user_id == user.id, UserSession.session_id == session_id
        ).delete()
        db.commit()


@router.get("/me", response_model=CurrentUserInfo)
def get_me(scope: dict = Depends(get_current_user_scope)):
    user: User = scope["user"]
    return CurrentUserInfo(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        avatar_url=user.avatar_url,
        group_id=scope["group_id"],
        brand_id=scope["brand_id"],
        zone_id=scope["zone_id"],
    )


@router.put("/me", response_model=CurrentUserInfo)
def update_my_profile(
    payload: MyProfileUpdate,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    """
    Any authenticated user (any role) can update their own display name,
    avatar, and username this way — deliberately separate from the admin
    /api/users endpoints, which are role-scoped and can't be used by staff
    on themselves.
    """
    user: User = scope["user"]
    data = payload.model_dump(exclude_unset=True)

    if "username" in data and data["username"]:
        existing = db.query(User).filter(User.username == data["username"], User.id != user.id).first()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That username is already taken")

    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)

    return CurrentUserInfo(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        avatar_url=user.avatar_url,
        group_id=scope["group_id"],
        brand_id=scope["brand_id"],
        zone_id=scope["zone_id"],
    )

