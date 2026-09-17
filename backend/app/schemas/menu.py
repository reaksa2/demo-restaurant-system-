import uuid
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.category import CategoryOut
from app.schemas.food import FoodMenuOut
from app.schemas.zone import ZoneOut


class BrandMenuInfo(BaseModel):
    id: uuid.UUID
    slug: str
    name_en: str
    name_kh: str
    description_en: Optional[str] = None
    description_kh: Optional[str] = None
    logo_url: Optional[str] = None
    background_image_url: Optional[str] = None
    background_opacity: int
    ordering_enabled: bool

    class Config:
        from_attributes = True


class MenuResponse(BaseModel):
    """
    The only thing ever returned to staff/customers.
    Every food in `foods` carries exactly one resolved price for a single
    zone (active_zone_id) — never more than one zone's price in the same
    response, even for a staff account with all-zone access.
    """
    brand: BrandMenuInfo
    categories: List[CategoryOut]
    foods: List[FoodMenuOut]

    # Populated only for a staff account NOT locked to one zone, so the
    # frontend can render a tab per zone. Empty for a single-zone-locked
    # staff account (no tabs to show).
    zones: List[ZoneOut] = []
    # Which single zone the `foods` prices above belong to.
    active_zone_id: Optional[uuid.UUID] = None