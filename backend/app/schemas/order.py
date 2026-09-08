import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class OrderItemCreate(BaseModel):
    food_id: uuid.UUID
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    table_label: Optional[str] = None
    items: List[OrderItemCreate]


class OrderItemOut(BaseModel):
    food_name_en: str
    food_name_kh: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id: uuid.UUID
    table_label: Optional[str] = None
    zone_name_en: Optional[str] = None
    zone_name_kh: Optional[str] = None
    placed_by_name: Optional[str] = None
    total_amount: Decimal
    telegram_notified: str  # not_configured | sent | failed
    created_at: datetime
    items: List[OrderItemOut]
