from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.core.permissions import get_user_group_id, get_user_brand_link
from app.db.database import get_db
from app.db.models.user import User, UserRole
from app.db.models.session import UserSession

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    session_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        # This same row can disappear for several reasons - a device-limit
        # eviction on a newer login, an admin revoking this device (or all
        # devices) from the Users page, or the row's own expiry being
        # cleaned up below - so the message stays generic rather than
        # naming one specific cause.
        detail="This device has been signed out. Please log in again.",
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

    # Configurable multi-device login: the token's session id must still have
    # a matching row. A row is removed either by /api/auth/logout for that
    # one device, or automatically at a later login once this user is over
    # their configured max_devices (oldest session evicted first).
    session = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id, UserSession.session_id == token_session_id)
        .first()
    )
    if session is None:
        raise session_exception

    now = datetime.utcnow()

    # Belt-and-suspenders alongside the JWT's own "exp" claim: if this row
    # outlived its expiry (clock skew, a long-lived request, etc.), delete
    # it now so it stops occupying a max_devices slot instead of waiting for
    # a future login's cap eviction to notice. expires_at is NULL for a
    # never_expire account's session — that row is always treated as valid.
    if session.expires_at is not None and session.expires_at < now:
        db.delete(session)
        db.commit()
        raise session_exception

    # Opportunistic "last seen" tracking for the admin's device list —
    # throttled to once every 5 minutes per session so this doesn't turn
    # into a write on literally every request this device makes.
    if session.last_seen_at is None or (now - session.last_seen_at) > timedelta(minutes=5):
        session.last_seen_at = now
        db.commit()

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
    """
    brand_id is always required. zone_id may legitimately be None here —
    that means this staff account is not locked to one zone and can browse
    every zone in its brand via tabs (see app/api/public_menu.py).
    """
    if scope["user"].role != UserRole.STAFF:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff account required")
    if scope["brand_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This staff account has no brand assigned yet. Contact your manager.",
        )
    return scope
