import uuid
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.category import CategoryOut
from app.schemas.food import FoodMenuOut


class BrandMenuInfo(BaseModel):
    id: uuid.UUID
    slug: str
    name_en: str
    name_kh: str
    description_en: Optional[str] = None
    description_kh: Optional[str] = None
    logo_url: Optional[str] = None
    ordering_enabled: bool

    class Config:
        from_attributes = True


class MenuResponse(BaseModel):
    """
    The only thing ever returned to staff/customers.
    Every food in `foods` carries exactly one resolved price for the
    caller's zone — never both zones' prices.
    """
    brand: BrandMenuInfo
    categories: List[CategoryOut]
    foods: List[FoodMenuOut]
