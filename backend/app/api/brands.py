import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_scope
from app.core.permissions import require_level1, assert_brand_access, require_roles
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.group import Group
from app.db.models.user import UserRole
from app.schemas.brand import BrandCreate, BrandUpdate, BrandAdminUpdate, BrandOut

router = APIRouter(prefix="/api/brands", tags=["brands"])


def _to_out(brand: Brand, user) -> BrandOut:
    out = BrandOut.model_validate(brand)
    if user.role == UserRole.STAFF:
        # Staff can read basic brand info but never the Telegram bot credentials.
        out.telegram_bot_token = None
        out.telegram_chat_id = None
    return out


@router.get("", response_model=list[BrandOut])
def list_brands(scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    user = scope["user"]
    if user.role == UserRole.LEVEL1:
        brands = db.query(Brand).order_by(Brand.name_en).all()
    elif user.role == UserRole.LEVEL2 and scope["group_id"] is not None:
        brands = db.query(Brand).filter(Brand.group_id == scope["group_id"]).order_by(Brand.name_en).all()
    elif user.role in (UserRole.LEVEL3, UserRole.STAFF) and scope["brand_id"] is not None:
        brands = db.query(Brand).filter(Brand.id == scope["brand_id"]).all()
    else:
        brands = []
    return [_to_out(b, user) for b in brands]


@router.get("/{brand_id}", response_model=BrandOut)
def get_brand(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_access(db, scope["user"], brand_id, allow_staff=True)
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    return _to_out(brand, scope["user"])


@router.post("", response_model=BrandOut, status_code=status.HTTP_201_CREATED)
def create_brand(payload: BrandCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    # Only Level 1 creates brands (spec 3/4/5).
    require_level1(scope["user"])

    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if db.query(Brand).filter(Brand.slug == payload.slug).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")

    brand = Brand(**payload.model_dump())
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@router.put("/{brand_id}", response_model=BrandOut)
def update_brand(
    brand_id: uuid.UUID,
    payload: BrandUpdate,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    # Level 1/2/3 can edit brand info; Level 2/3 cannot move brands between
    # groups or change the slug (see BrandUpdate vs BrandAdminUpdate).
    user = scope["user"]
    require_roles(user, UserRole.LEVEL1, UserRole.LEVEL2, UserRole.LEVEL3)
    assert_brand_access(db, user, brand_id, allow_staff=False)

    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(brand, field, value)

    db.commit()
    db.refresh(brand)
    return brand


@router.put("/{brand_id}/admin", response_model=BrandOut)
def admin_update_brand(
    brand_id: uuid.UUID,
    payload: BrandAdminUpdate,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    """Level 1 only: reassign group_id / change slug in addition to normal fields."""
    require_level1(scope["user"])
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")

    data = payload.model_dump(exclude_unset=True)
    if "group_id" in data and data["group_id"] is not None:
        if db.query(Group).filter(Group.id == data["group_id"]).first() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if "slug" in data and data["slug"] is not None:
        existing = db.query(Brand).filter(Brand.slug == data["slug"], Brand.id != brand_id).first()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")

    for field, value in data.items():
        setattr(brand, field, value)

    db.commit()
    db.refresh(brand)
    return brand


@router.delete("/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brand(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    # Only Level 1 deletes brands (spec 3/4/5).
    require_level1(scope["user"])
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    db.delete(brand)
    db.commit()
