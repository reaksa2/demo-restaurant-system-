import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_scope
from app.core.permissions import require_roles
from app.core.security import hash_password
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.group import Group
from app.db.models.zone import Zone
from app.db.models.user import User, UserRole
from app.db.models.session import UserSession
from app.db.models.associations import UserGroup, UserBrand
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.schemas.session import UserSessionOut

router = APIRouter(prefix="/api/users", tags=["users"])


def _to_out(db: Session, user: User) -> UserOut:
    group_id = None
    brand_id = None
    zone_id = None
    if user.role == UserRole.LEVEL2:
        link = db.query(UserGroup).filter(UserGroup.user_id == user.id).first()
        if link:
            group_id = link.group_id
    elif user.role in (UserRole.LEVEL3, UserRole.STAFF):
        link = db.query(UserBrand).filter(UserBrand.user_id == user.id).first()
        if link:
            brand_id = link.brand_id
            zone_id = link.zone_id

    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        avatar_url=user.avatar_url,
        group_id=group_id,
        brand_id=brand_id,
        zone_id=zone_id,
        max_devices=user.max_devices,
        # Only count sessions whose token hasn't expired yet — a row can sit
        # here briefly after its device's JWT expires (until the next login
        # or authenticated request purges it), and it should not be shown as
        # a currently logged-in device in the meantime. A NULL expires_at
        # (never_expire account) always counts as active.
        active_sessions=(
            db.query(UserSession)
            .filter(
                UserSession.user_id == user.id,
                or_(UserSession.expires_at.is_(None), UserSession.expires_at >= datetime.utcnow()),
            )
            .count()
        ),
        never_expire=user.never_expire,
        created_at=user.created_at,
    )


@router.get("", response_model=list[UserOut])
def list_users(scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    user = scope["user"]

    if user.role == UserRole.LEVEL1:
        users = db.query(User).order_by(User.created_at).all()

    elif user.role == UserRole.LEVEL2:
        group_id = scope["group_id"]
        brand_ids = [b.id for b in db.query(Brand).filter(Brand.group_id == group_id).all()]
        brand_user_ids = {
            link.user_id for link in db.query(UserBrand).filter(UserBrand.brand_id.in_(brand_ids)).all()
        }
        users = db.query(User).filter(User.id.in_(brand_user_ids)).all() if brand_user_ids else []

    elif user.role == UserRole.LEVEL3:
        brand_id = scope["brand_id"]
        staff_ids = {
            link.user_id
            for link in db.query(UserBrand).filter(UserBrand.brand_id == brand_id).all()
        }
        users = (
            db.query(User).filter(User.id.in_(staff_ids), User.role == UserRole.STAFF).all()
            if staff_ids
            else []
        )

    else:  # STAFF
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff cannot manage users")

    return [_to_out(db, u) for u in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    creator = scope["user"]

    if db.query(User).filter(User.email == payload.email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if payload.username and db.query(User).filter(User.username == payload.username).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    # --- who can create whom ---
    if creator.role == UserRole.LEVEL1:
        pass  # can create LEVEL2, LEVEL3, or STAFF
    elif creator.role == UserRole.LEVEL2:
        require_roles(creator, UserRole.LEVEL2)
        if payload.role not in (UserRole.LEVEL3, UserRole.STAFF):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group managers can only create brand managers or staff")
    elif creator.role == UserRole.LEVEL3:
        if payload.role != UserRole.STAFF:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Brand managers can only create staff")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff cannot create users")

    # --- validate + resolve scope for the new user ---
    group_id = None
    brand_id = None
    zone_id = None

    if payload.role == UserRole.LEVEL2:
        if payload.group_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="group_id is required for a Level 2 user")
        if db.query(Group).filter(Group.id == payload.group_id).first() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        group_id = payload.group_id

    elif payload.role == UserRole.LEVEL3:
        if payload.brand_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required for a Level 3 user")
        brand = db.query(Brand).filter(Brand.id == payload.brand_id).first()
        if brand is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        if creator.role == UserRole.LEVEL2 and brand.group_id != scope["group_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That brand is outside your group")
        brand_id = payload.brand_id

    elif payload.role == UserRole.STAFF:
        if payload.brand_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required for staff")
        brand = db.query(Brand).filter(Brand.id == payload.brand_id).first()
        if brand is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        # zone_id is optional: leave it unset for a staff account that can
        # browse every zone in the brand via tabs, or set it to lock the
        # account to just that one zone.
        if payload.zone_id is not None:
            zone = db.query(Zone).filter(Zone.id == payload.zone_id, Zone.brand_id == payload.brand_id).first()
            if zone is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found in this brand")
        if creator.role == UserRole.LEVEL2 and brand.group_id != scope["group_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That brand is outside your group")
        if creator.role == UserRole.LEVEL3 and payload.brand_id != scope["brand_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only create staff for your own brand")
        brand_id = payload.brand_id
        zone_id = payload.zone_id

    # --- create ---
    user = User(
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        max_devices=payload.max_devices,
        never_expire=payload.never_expire,
    )
    db.add(user)
    db.flush()  # get user.id without committing yet

    if group_id is not None:
        db.add(UserGroup(user_id=user.id, group_id=group_id))
    if brand_id is not None:
        db.add(UserBrand(user_id=user.id, brand_id=brand_id, zone_id=zone_id))

    db.commit()
    db.refresh(user)
    return _to_out(db, user)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    creator = scope["user"]
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Re-use list_users' visibility rule: you may only edit users you can see.
    visible_ids = {u.id for u in list_users(scope, db)}  # type: ignore[arg-type]
    if creator.role != UserRole.LEVEL1 and target.id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this user")
    if creator.role == UserRole.STAFF:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff cannot manage users")

    # exclude_unset so a "zone_id": null in the request body (switching a
    # staff account to all-zone access) is distinguishable from the field
    # being left out entirely (leave zone access unchanged).
    data = payload.model_dump(exclude_unset=True)

    if "full_name" in data and data["full_name"] is not None:
        target.full_name = data["full_name"]
    if "username" in data:
        new_username = data["username"]
        if new_username and db.query(User).filter(User.username == new_username, User.id != target.id).first() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        target.username = new_username or None
    if "password" in data and data["password"]:
        target.password_hash = hash_password(data["password"])
    if "is_active" in data and data["is_active"] is not None:
        target.is_active = data["is_active"]
    if "max_devices" in data and data["max_devices"] is not None:
        target.max_devices = data["max_devices"]
    if "never_expire" in data and data["never_expire"] is not None:
        target.never_expire = data["never_expire"]
    if "zone_id" in data and target.role == UserRole.STAFF:
        new_zone_id = data["zone_id"]  # None -> switch to all-zone (tabbed) access
        link = db.query(UserBrand).filter(UserBrand.user_id == target.id).first()
        if link is not None:
            if new_zone_id is not None:
                zone = db.query(Zone).filter(Zone.id == new_zone_id, Zone.brand_id == link.brand_id).first()
                if zone is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found in that staff member's brand")
            link.zone_id = new_zone_id

    db.commit()
    db.refresh(target)
    return _to_out(db, target)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    creator = scope["user"]
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    visible_ids = {u.id for u in list_users(scope, db)}  # type: ignore[arg-type]
    if creator.role != UserRole.LEVEL1 and target.id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this user")
    if creator.role == UserRole.STAFF:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff cannot manage users")
    if target.id == creator.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")

    db.delete(target)
    db.commit()


def _check_session_access(scope: dict, target: User, db: Session) -> None:
    """Shared permission check for all three session-management endpoints
    below: same visibility rule as viewing/editing the user themselves."""
    creator = scope["user"]
    if creator.role == UserRole.STAFF:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff cannot manage users")
    visible_ids = {u.id for u in list_users(scope, db)}  # type: ignore[arg-type]
    if creator.role != UserRole.LEVEL1 and target.id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this user")


@router.get("/{user_id}/sessions", response_model=list[UserSessionOut])
def list_user_sessions(user_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """
    Every device currently (or formerly, until the next cleanup) logged into
    this account, newest first, so an admin can see who's logged in on what
    and revoke anything that looks wrong.
    """
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_session_access(scope, target, db)

    sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == user_id)
        .order_by(UserSession.created_at.desc())
        .all()
    )
    return sessions


@router.delete("/{user_id}/sessions/{session_row_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_user_session(
    user_id: uuid.UUID,
    session_row_id: uuid.UUID,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    """Signs out one specific device immediately — its next request gets
    401'd by get_current_user since the row it checks for is now gone."""
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_session_access(scope, target, db)

    session = db.query(UserSession).filter(UserSession.id == session_row_id, UserSession.user_id == user_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    db.delete(session)
    db.commit()


@router.delete("/{user_id}/sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_all_user_sessions(user_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """Signs this account out of every device at once (e.g. a lost/stolen
    tablet, or just wanting a clean slate)."""
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_session_access(scope, target, db)

    db.query(UserSession).filter(UserSession.user_id == user_id).delete()
    db.commit()
