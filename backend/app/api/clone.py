import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user_scope
from app.core.permissions import require_roles
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.category import Category
from app.db.models.food import Food
from app.db.models.food_price import FoodPrice
from app.db.models.user import UserRole
from app.db.models.zone import Zone

router = APIRouter(prefix="/api/clone", tags=["clone"])


class CloneRequest(BaseModel):
    source_brand_id: uuid.UUID
    target_brand_id: uuid.UUID


class CloneResult(BaseModel):
    foods_cloned: int
    categories_created: int
    warnings: list[str]


@router.post("/foods", response_model=CloneResult)
def clone_food_list(
    payload: CloneRequest,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    """
    Level 2 only. Clones every food in source_brand into target_brand.
    Cloned foods (and their prices) become fully independent rows —
    editing them afterwards never touches the source brand's data.

    Categories are matched by English name; if the target brand has no
    matching category, a new one is created there. Zone prices are matched
    by English zone name (e.g. "Inside" -> "Inside"); if the target brand
    has no zone with that name, that particular price is skipped and
    reported back as a warning instead of silently dropped.
    """
    user = scope["user"]
    require_roles(user, UserRole.LEVEL1, UserRole.LEVEL2)

    source_brand = db.query(Brand).filter(Brand.id == payload.source_brand_id).first()
    target_brand = db.query(Brand).filter(Brand.id == payload.target_brand_id).first()

    if source_brand is None or target_brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source or target brand not found")

    if user.role == UserRole.LEVEL2:
        # Level 2 can only clone within their own assigned group.
        group_id = scope["group_id"]
        if source_brand.group_id != group_id or target_brand.group_id != group_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Both brands must belong to your assigned group",
            )
    else:
        # Level 1 has no single assigned group, but cloning is still a
        # within-group operation by design — both brands must share a group.
        if source_brand.group_id != target_brand.group_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Both brands must belong to the same group",
            )

    if source_brand.id == target_brand.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source and target brand must differ")

    warnings: list[str] = []

    # --- build category map: source category id -> target category ---
    # Top-level categories are cloned first, then subcategories, so a
    # subcategory's parent_id can be remapped to the correct NEW parent
    # in the target brand (never the source brand's parent id).
    target_categories_by_name = {
        c.name_en.strip().lower(): c for c in db.query(Category).filter(Category.brand_id == target_brand.id).all()
    }
    categories_created = 0
    category_map: dict[uuid.UUID, Optional[Category]] = {}

    source_categories = db.query(Category).filter(Category.brand_id == source_brand.id).all()
    top_level = [c for c in source_categories if c.parent_id is None]
    sub_level = [c for c in source_categories if c.parent_id is not None]

    for src_cat in top_level:
        key = src_cat.name_en.strip().lower()
        existing = target_categories_by_name.get(key)
        if existing is not None:
            category_map[src_cat.id] = existing
        else:
            new_cat = Category(
                brand_id=target_brand.id,
                name_en=src_cat.name_en,
                name_kh=src_cat.name_kh,
                sort_order=src_cat.sort_order,
            )
            db.add(new_cat)
            db.flush()
            target_categories_by_name[key] = new_cat
            category_map[src_cat.id] = new_cat
            categories_created += 1

    for src_cat in sub_level:
        key = src_cat.name_en.strip().lower()
        existing = target_categories_by_name.get(key)
        new_parent = category_map.get(src_cat.parent_id)
        if existing is not None:
            category_map[src_cat.id] = existing
        else:
            new_cat = Category(
                brand_id=target_brand.id,
                parent_id=new_parent.id if new_parent else None,
                name_en=src_cat.name_en,
                name_kh=src_cat.name_kh,
                sort_order=src_cat.sort_order,
            )
            db.add(new_cat)
            db.flush()
            target_categories_by_name[key] = new_cat
            category_map[src_cat.id] = new_cat
            categories_created += 1

    # --- build zone map: source zone id -> target zone (by matching name) ---
    target_zones_by_name = {
        z.name_en.strip().lower(): z for z in db.query(Zone).filter(Zone.brand_id == target_brand.id).all()
    }
    source_zones = {z.id: z for z in db.query(Zone).filter(Zone.brand_id == source_brand.id).all()}

    # --- clone foods ---
    source_foods = (
        db.query(Food)
        .options(joinedload(Food.prices))
        .filter(Food.brand_id == source_brand.id)
        .all()
    )

    for src_food in source_foods:
        new_category = category_map.get(src_food.category_id) if src_food.category_id else None

        new_food = Food(
            brand_id=target_brand.id,
            category_id=new_category.id if new_category else None,
            name_en=src_food.name_en,
            name_kh=src_food.name_kh,
            description_en=src_food.description_en,
            description_kh=src_food.description_kh,
            image_url=src_food.image_url,
            is_available=src_food.is_available,
        )
        db.add(new_food)
        db.flush()  # need new_food.id for prices

        for src_price in src_food.prices:
            src_zone = source_zones.get(src_price.zone_id)
            if src_zone is None:
                continue
            target_zone = target_zones_by_name.get(src_zone.name_en.strip().lower())
            if target_zone is None:
                warnings.append(
                    f'"{src_food.name_en}": no zone named "{src_zone.name_en}" in target brand — price skipped'
                )
                continue

            db.add(
                FoodPrice(
                    food_id=new_food.id,
                    zone_id=target_zone.id,
                    regular_price=src_price.regular_price,
                    discount_price=src_price.discount_price,
                    discount_active=src_price.discount_active,
                )
            )

    db.commit()

    return CloneResult(
        foods_cloned=len(source_foods),
        categories_created=categories_created,
        warnings=warnings,
    )