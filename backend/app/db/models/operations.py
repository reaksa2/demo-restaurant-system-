"""
Back-office tables: expenses, stock (inventory), recipes, suppliers and
purchase orders. Every row belongs to one brand (ON DELETE CASCADE), and
none of these use Postgres ENUM types on purpose — plain strings validated
in the API — so adding a new kind/status later never needs an
ALTER TYPE migration like the user roles did.
"""
import uuid
from datetime import datetime, date

from sqlalchemy import (
    Column, String, DateTime, Date, ForeignKey, Integer, Numeric, Boolean, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class Expense(Base):
    """Money going out (rent, salary, utilities, supplier payments ...)."""
    __tablename__ = "expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    expense_date = Column(Date, default=date.today, nullable=False, index=True)
    category = Column(String(50), nullable=False)
    description = Column(String(500), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(20), nullable=True)  # cash | bank | card | qr | other
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    supplier = relationship("Supplier")
    created_by = relationship("User")


class StockItem(Base):
    """An ingredient / supply tracked in stock (rice, beer cans, napkins ...)."""
    __tablename__ = "stock_items"
    __table_args__ = (UniqueConstraint("brand_id", "name_en", name="uq_stock_item_brand_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    name_en = Column(String(255), nullable=False)
    name_kh = Column(String(255), nullable=True)
    unit = Column(String(30), nullable=False, default="pcs")  # kg, l, can, pcs ...
    quantity = Column(Numeric(14, 3), nullable=False, default=0)       # on hand (may go negative if sales outrun counts)
    reorder_level = Column(Numeric(14, 3), nullable=False, default=0)  # alert when quantity <= this
    avg_cost = Column(Numeric(12, 4), nullable=False, default=0)       # weighted-average cost per unit
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class StockMovement(Base):
    """
    Immutable ledger of every change to a stock item. quantity is signed
    (+ in, - out). kind: purchase | stock_in | stock_out | waste | adjustment | sale
    """
    __tablename__ = "stock_movements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_item_id = Column(UUID(as_uuid=True), ForeignKey("stock_items.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)
    quantity = Column(Numeric(14, 3), nullable=False)
    unit_cost = Column(Numeric(12, 4), nullable=True)
    note = Column(String(500), nullable=True)
    ref_purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True)
    ref_order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    stock_item = relationship("StockItem")


class FoodIngredient(Base):
    """Recipe line: selling 1 of `food` uses `quantity_per_unit` of `stock_item`."""
    __tablename__ = "food_ingredients"
    __table_args__ = (UniqueConstraint("food_id", "stock_item_id", name="uq_food_ingredient"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    food_id = Column(UUID(as_uuid=True), ForeignKey("foods.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_item_id = Column(UUID(as_uuid=True), ForeignKey("stock_items.id", ondelete="CASCADE"), nullable=False)
    quantity_per_unit = Column(Numeric(14, 3), nullable=False)

    stock_item = relationship("StockItem")


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    note = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class PurchaseOrder(Base):
    """
    status: draft -> ordered -> received (or cancelled from draft/ordered).
    Receiving adds the items to stock. paid_amount tracks payments made to
    the supplier; each payment also becomes an Expense, so the P&L counts the
    cost when cash leaves, and total_amount - paid_amount is what we still owe.
    """
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    po_number = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="draft")
    note = Column(String(500), nullable=True)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    received_at = Column(DateTime, nullable=True)

    supplier = relationship("Supplier")
    items = relationship("PurchaseItem", back_populates="purchase_order", cascade="all, delete-orphan")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    stock_item_id = Column(UUID(as_uuid=True), ForeignKey("stock_items.id", ondelete="SET NULL"), nullable=True)
    item_name = Column(String(255), nullable=False)  # snapshot, survives item deletion
    unit = Column(String(30), nullable=True)
    quantity = Column(Numeric(14, 3), nullable=False)
    unit_cost = Column(Numeric(12, 4), nullable=False)

    purchase_order = relationship("PurchaseOrder", back_populates="items")

    @property
    def line_total(self):
        return self.quantity * self.unit_cost
