import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_scope
from app.core.permissions import require_roles
from app.core.security import hash_password
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.group import Group
from app.db.models.zone import Zone
from app.db.models.user import User, UserRole
from app.db.models.associations import UserGroup, UserBrand
from app.schemas.user import UserCreate, UserUpdate, UserOut

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
        if payload.brand_id is None or payload.zone_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id and zone_id are required for staff")
        brand = db.query(Brand).filter(Brand.id == payload.brand_id).first()
        if brand is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
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

    if payload.full_name is not None:
        target.full_name = payload.full_name
    if payload.username is not None:
        if payload.username and db.query(User).filter(User.username == payload.username, User.id != target.id).first() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        target.username = payload.username or None
    if payload.password is not None:
        target.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.zone_id is not None and target.role == UserRole.STAFF:
        link = db.query(UserBrand).filter(UserBrand.user_id == target.id).first()
        if link is not None:
            zone = db.query(Zone).filter(Zone.id == payload.zone_id, Zone.brand_id == link.brand_id).first()
            if zone is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found in that staff member's brand")
            link.zone_id = payload.zone_id

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
