import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Numeric, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class OrderStatus(str, enum.Enum):
    PENDING = "pending"      # just placed, not yet paid/closed out
    COMPLETED = "completed"  # customer paid and left
    CANCELLED = "cancelled"  # order voided (mistake, customer changed mind, etc.)


class Order(Base):
    """
    One order = one submission from staff on behalf of a table/room. Per the
    restaurant's own workflow, repeat orders from the same table are simply
    separate Order rows — no "running tab" merging. table_label is a free-text
    field (e.g. "Table 5") since zones represent broad areas (Inside/Outside),
    not individual tables.
    """
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="SET NULL"), nullable=True)
    placed_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    table_label = Column(String(100), nullable=True)
    total_amount = Column(Numeric(10, 2), nullable=False)
    status = Column(
        Enum(OrderStatus, values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        default=OrderStatus.PENDING,
        nullable=False,
    )

    # Whether the Telegram notification actually went out — useful for staff/
    # admin to notice a misconfigured bot without the order itself failing.
    telegram_notified = Column(String(20), default="not_configured", nullable=False)  # not_configured | sent | failed

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    brand = relationship("Brand", back_populates="orders")
    zone = relationship("Zone")
    placed_by = relationship("User")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    """
    Snapshots the food's name and price at order time, deliberately not just a
    live reference to Food/FoodPrice — so past orders stay accurate even if a
    food is later renamed, repriced, or deleted.
    """
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    food_id = Column(UUID(as_uuid=True), ForeignKey("foods.id", ondelete="SET NULL"), nullable=True)

    food_name_en = Column(String(255), nullable=False)
    food_name_kh = Column(String(255), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")

    @property
    def line_total(self):
        return self.unit_price * self.quantity
