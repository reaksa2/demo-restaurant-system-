import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_scope, get_current_user
from app.core.security import verify_password, create_access_token
from app.db.database import get_db
from app.db.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, CurrentUserInfo, MyProfileUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    # Single-device login: a fresh session id here immediately invalidates
    # whatever device/token was previously logged in as this user.
    session_id = uuid.uuid4().hex
    user.active_session_id = session_id
    db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role.value, "sid": session_id})
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Clears the active session immediately, rather than waiting for a new login to overwrite it."""
    user.active_session_id = None
    db.commit()


@router.get("/me", response_model=CurrentUserInfo)
def get_me(scope: dict = Depends(get_current_user_scope)):
    user: User = scope["user"]
    return CurrentUserInfo(
        id=user.id,
        email=user.email,
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
    Any authenticated user (any role) can update their own display name and
    avatar this way — deliberately separate from the admin /api/users
    endpoints, which are role-scoped and can't be used by staff on themselves.
    """
    user: User = scope["user"]
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)

    return CurrentUserInfo(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        avatar_url=user.avatar_url,
        group_id=scope["group_id"],
        brand_id=scope["brand_id"],
        zone_id=scope["zone_id"],
    )

