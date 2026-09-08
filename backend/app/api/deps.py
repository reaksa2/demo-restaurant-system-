from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.core.permissions import get_user_group_id, get_user_brand_link
from app.db.database import get_db
from app.db.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    session_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="This account was signed in on another device. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    token_session_id = payload.get("sid")
    if user_id is None or token_session_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception

    if user.active_session_id != token_session_id:
        raise session_exception

    return user


def get_current_user_scope(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """
    Returns the current user plus their resolved scope
    (group_id for LEVEL2; brand_id (+zone_id for STAFF) for LEVEL3/STAFF).
    """
    group_id = None
    brand_id = None
    zone_id = None

    if user.role == UserRole.LEVEL2:
        group_id = get_user_group_id(db, user)
    elif user.role in (UserRole.LEVEL3, UserRole.STAFF):
        link = get_user_brand_link(db, user)
        if link is not None:
            brand_id = link.brand_id
            zone_id = link.zone_id  # only populated for STAFF

    return {"user": user, "group_id": group_id, "brand_id": brand_id, "zone_id": zone_id}


def require_staff(scope: dict = Depends(get_current_user_scope)) -> dict:
    if scope["user"].role != UserRole.STAFF:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff account required")
    if scope["brand_id"] is None or scope["zone_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This staff account has no brand/zone assigned yet. Contact your manager.",
        )
    return scope
