import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Numeric, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class BillStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PAID = "paid"
    VOID = "void"  # bill created by mistake / cancelled before payment


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    QR = "qr"          # e.g. KHQR / bank QR payment
    OTHER = "other"


class Bill(Base):
    """
    One bill = one or more completed Orders for the same table, closed out
    together at checkout. A bill snapshots its own totals (subtotal,
    discount, tax, grand total) at the moment it's created, independent of
    whatever the underlying orders' total_amount fields say — so an invoice
    printed later never silently changes if an order row is edited.

    invoice_number is a short human-friendly sequence per brand (e.g. #0001),
    separate from the UUID primary key, because a customer-facing invoice
    should never show a UUID.
    """
    __tablename__ = "bills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    invoice_number = Column(Integer, nullable=False)
    table_label = Column(String(100), nullable=True)

    subtotal = Column(Numeric(10, 2), nullable=False)
    discount_amount = Column(Numeric(10, 2), default=0, nullable=False)
    tax_rate = Column(Numeric(5, 2), default=0, nullable=False)  # percent, e.g. 10.00 = 10%
    tax_amount = Column(Numeric(10, 2), default=0, nullable=False)
    total_amount = Column(Numeric(10, 2), nullable=False)

    status = Column(
        Enum(BillStatus, values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        default=BillStatus.UNPAID,
        nullable=False,
    )
    payment_method = Column(
        Enum(PaymentMethod, values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        nullable=True,
    )
    paid_at = Column(DateTime, nullable=True)
    notes = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    brand = relationship("Brand", back_populates="bills")
    zone = relationship("Zone")
    created_by = relationship("User")
    items = relationship("BillItem", back_populates="bill", cascade="all, delete-orphan")
    orders = relationship("BillOrder", back_populates="bill", cascade="all, delete-orphan")


class BillItem(Base):
    """
    Line items on the bill, aggregated from the underlying orders' items
    (same food across multiple orders for the table is merged into one line
    with a summed quantity), snapshotted the same way OrderItem is.
    """
    __tablename__ = "bill_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bill_id = Column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False)

    food_name_en = Column(String(255), nullable=False)
    food_name_kh = Column(String(255), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False)

    bill = relationship("Bill", back_populates="items")

    @property
    def line_total(self):
        return self.unit_price * self.quantity


class BillOrder(Base):
    """Join table: which Order rows were folded into this Bill (for traceability/audit)."""
    __tablename__ = "bill_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bill_id = Column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)

    bill = relationship("Bill", back_populates="orders")
    order = relationship("Order")
