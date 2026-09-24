import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_staff
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.category import Category
from app.db.models.food import Food
from app.db.models.zone import Zone
from app.schemas.category import CategoryOut
from app.schemas.food import FoodMenuOut
from app.schemas.food_price import SinglePriceOut
from app.schemas.menu import MenuResponse, BrandMenuInfo
from app.schemas.zone import ZoneOut

router = APIRouter(prefix="/api/menu", tags=["menu"])


@router.get("", response_model=MenuResponse)
def get_staff_menu(
    zone_id: Optional[uuid.UUID] = Query(
        None,
        description="Which zone's tab to show. Only used for a staff account with all-zone access; ignored for a staff account locked to one zone.",
    ),
    scope: dict = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """
    The staff/customer-facing menu display.

    Requires a logged-in STAFF user. A staff account locked to one zone (its
    UserBrand.zone_id is set) always gets that zone's prices, exactly like
    before. A staff account with all-zone access (zone_id is NULL) can pass
    ?zone_id=... to pick which zone's tab to view; every response still
    resolves and returns exactly ONE zone's prices — never more than one
    zone in the same response, even though one login can now reach all of
    them by switching tabs.
    """
    brand_id = scope["brand_id"]
    locked_zone_id = scope["zone_id"]

    all_zones = db.query(Zone).filter(Zone.brand_id == brand_id).order_by(Zone.name_en).all()

    if locked_zone_id is not None:
        # Single-zone-locked staff: no tabs, always their one zone.
        resolved_zone_id = locked_zone_id
        zones_out: list[ZoneOut] = []
    else:
        if not all_zones:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This brand has no zones set up yet. Contact your manager.",
            )
        if zone_id is not None and any(z.id == zone_id for z in all_zones):
            resolved_zone_id = zone_id
        else:
            resolved_zone_id = all_zones[0].id  # default to the first tab
        zones_out = [ZoneOut.model_validate(z) for z in all_zones]

    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    categories = db.query(Category).filter(Category.brand_id == brand_id).order_by(Category.sort_order).all()

    # Alphabetical by English name — the canonical name field used
    # everywhere else in the app — so both the flat "All" view and each
    # category/subcategory section list foods in a stable, predictable
    # order instead of whatever order they happened to be created in.
    foods = (
        db.query(Food)
        .options(joinedload(Food.prices))
        .filter(Food.brand_id == brand_id)
        .order_by(func.lower(Food.name_en))
        .all()
    )

    food_out: list[FoodMenuOut] = []
    for food in foods:
        price_row = next((p for p in food.prices if p.zone_id == resolved_zone_id), None)
        single_price = None
        if price_row is not None:
            single_price = SinglePriceOut(
                price=price_row.effective_price,
                is_discounted=bool(price_row.discount_active and price_row.discount_price is not None),
            )

        food_out.append(
            FoodMenuOut(
                id=food.id,
                name_en=food.name_en,
                name_kh=food.name_kh,
                description_en=food.description_en,
                description_kh=food.description_kh,
                image_url=food.image_url,
                is_available=food.is_available,
                category_id=food.category_id,
                price=single_price,
            )
        )

    return MenuResponse(
        brand=BrandMenuInfo.model_validate(brand),
        categories=[CategoryOut.model_validate(c) for c in categories],
        foods=food_out,
        zones=zones_out,
        active_zone_id=resolved_zone_id,
    )
