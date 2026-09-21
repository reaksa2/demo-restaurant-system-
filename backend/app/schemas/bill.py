import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from app.db.models.bill import BillStatus, PaymentMethod


class BillCreate(BaseModel):
    """
    Folds one or more PENDING/COMPLETED, not-yet-billed orders for the same
    table into a single bill. Staff pick which orders belong to this
    checkout (usually "all of this table's open orders").
    """
    order_ids: List[uuid.UUID] = Field(min_length=1)
    discount_amount: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")  # percent, e.g. 10 = 10%
    notes: Optional[str] = None


class BillPay(BaseModel):
    payment_method: PaymentMethod


class BillItemOut(BaseModel):
    food_name_en: str
    food_name_kh: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal

    class Config:
        from_attributes = True


class BillOut(BaseModel):
    id: uuid.UUID
    invoice_number: int
    table_label: Optional[str] = None
    zone_name_en: Optional[str] = None
    zone_name_kh: Optional[str] = None
    created_by_name: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    status: BillStatus
    payment_method: Optional[PaymentMethod] = None
    paid_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    items: List[BillItemOut]
