import uuid
from typing import Optional

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name_en: str
    name_kh: str
    sort_order: int = 0
    parent_id: Optional[uuid.UUID] = None  # None = top-level category


class CategoryUpdate(BaseModel):
    name_en: Optional[str] = None
    name_kh: Optional[str] = None
    sort_order: Optional[int] = None
    parent_id: Optional[uuid.UUID] = None


class CategoryOut(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    name_en: str
    name_kh: str
    sort_order: int

    class Config:
        from_attributes = True
