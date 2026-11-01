import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, Field


# ---------------- expenses ----------------
EXPENSE_CATEGORIES = [
    "ingredients", "purchases", "salary", "rent", "utilities", "marketing",
    "maintenance", "supplies", "transport", "tax", "other",
]


class ExpenseCreate(BaseModel):
    expense_date: date
    category: str = Field(min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    amount: Decimal = Field(gt=0)
    payment_method: Optional[str] = Field(default=None, max_length=20)
    supplier_id: Optional[uuid.UUID] = None


class ExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    amount: Optional[Decimal] = Field(default=None, gt=0)
    payment_method: Optional[str] = Field(default=None, max_length=20)
    supplier_id: Optional[uuid.UUID] = None


class ExpenseOut(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    expense_date: date
    category: str
    description: Optional[str] = None
    amount: Decimal
    payment_method: Optional[str] = None
    supplier_id: Optional[uuid.UUID] = None
    supplier_name: Optional[str] = None
    purchase_order_id: Optional[uuid.UUID] = None
    created_by_name: Optional[str] = None
    created_at: datetime


# ---------------- stock ----------------
class StockItemCreate(BaseModel):
    name_en: str = Field(min_length=1, max_length=255)
    name_kh: Optional[str] = Field(default=None, max_length=255)
    unit: str = Field(default="pcs", min_length=1, max_length=30)
    reorder_level: Decimal = Field(default=Decimal("0"), ge=0)
    opening_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    opening_unit_cost: Optional[Decimal] = Field(default=None, ge=0)


class StockItemUpdate(BaseModel):
    name_en: Optional[str] = Field(default=None, min_length=1, max_length=255)
    name_kh: Optional[str] = Field(default=None, max_length=255)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=30)
    reorder_level: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class StockItemOut(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    name_en: str
    name_kh: Optional[str] = None
    unit: str
    quantity: Decimal
    reorder_level: Decimal
    avg_cost: Decimal
    stock_value: Decimal
    low_stock: bool
    is_active: bool


class StockMovementCreate(BaseModel):
    # stock_in: add (optionally with a cost) | stock_out: use/remove | waste: spoiled/lost
    # adjustment: `quantity` is the COUNTED amount on the shelf; the difference is booked.
    kind: str  # stock_in | stock_out | waste | adjustment
    quantity: Decimal = Field(ge=0)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)
    note: Optional[str] = Field(default=None, max_length=500)


class StockMovementOut(BaseModel):
    id: uuid.UUID
    stock_item_id: uuid.UUID
    kind: str
    quantity: Decimal
    unit_cost: Optional[Decimal] = None
    note: Optional[str] = None
    created_at: datetime


class RecipeLine(BaseModel):
    stock_item_id: uuid.UUID
    quantity_per_unit: Decimal = Field(gt=0)


class RecipeLineOut(BaseModel):
    stock_item_id: uuid.UUID
    stock_item_name: str
    unit: str
    quantity_per_unit: Decimal


# ---------------- purchasing ----------------
class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    note: Optional[str] = Field(default=None, max_length=500)


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    note: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None


class SupplierOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: Optional[str] = None
    note: Optional[str] = None
    is_active: bool
    balance_owed: Decimal = Decimal("0")  # sum of (total - paid) on this supplier's received POs


class PurchaseLineIn(BaseModel):
    stock_item_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)


class PurchaseOrderCreate(BaseModel):
    supplier_id: Optional[uuid.UUID] = None
    note: Optional[str] = Field(default=None, max_length=500)
    items: List[PurchaseLineIn] = Field(min_length=1)


class PurchaseStatusUpdate(BaseModel):
    status: str  # ordered | received | cancelled


class PurchasePaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_method: Optional[str] = Field(default="cash", max_length=20)
    payment_date: Optional[date] = None


class PurchaseItemOut(BaseModel):
    stock_item_id: Optional[uuid.UUID] = None
    item_name: str
    unit: Optional[str] = None
    quantity: Decimal
    unit_cost: Decimal
    line_total: Decimal


class PurchaseOrderOut(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    po_number: int
    supplier_id: Optional[uuid.UUID] = None
    supplier_name: Optional[str] = None
    status: str
    note: Optional[str] = None
    total_amount: Decimal
    paid_amount: Decimal
    balance: Decimal
    items: List[PurchaseItemOut]
    created_at: datetime
    received_at: Optional[datetime] = None
