import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_scope, get_current_user, oauth2_scheme
from app.core.security import verify_password, create_access_token, decode_access_token
from app.db.database import get_db
from app.db.models.user import User
from app.db.models.session import UserSession
from app.schemas.auth import LoginRequest, TokenResponse, CurrentUserInfo, MyProfileUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    # Accepts either the account's email or its (optional) username in the
    # same field — whichever matches.
    user = db.query(User).filter(or_(User.email == payload.identifier, User.username == payload.identifier)).first()
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email/username or password")

    # Configurable multi-device login: this device gets its own session row.
    # If that puts the user over their configured max_devices, the
    # oldest/least-recently-logged-in device(s) are signed out to make room —
    # the newest login always succeeds.
    session_id = uuid.uuid4().hex
    db.add(UserSession(user_id=user.id, session_id=session_id))
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

    token = create_access_token({"sub": str(user.id), "role": user.role.value, "sid": session_id})
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

