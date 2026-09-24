import uuid
from typing import Optional

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name_en: str
    name_kh: str
    sort_order: int = 0
    parent_id: Optional[uuid.UUID] = None  # None = top-level category
    is_drink: bool = False


class CategoryUpdate(BaseModel):
    name_en: Optional[str] = None
    name_kh: Optional[str] = None
    sort_order: Optional[int] = None
    parent_id: Optional[uuid.UUID] = None
    is_drink: Optional[bool] = None


class CategoryOut(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    name_en: str
    name_kh: str
    sort_order: int
    is_drink: bool

    class Config:
        from_attributes = True
