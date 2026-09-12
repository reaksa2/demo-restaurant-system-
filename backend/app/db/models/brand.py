import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class Brand(Base):
    __tablename__ = "brands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)

    # Used in the public menu URL, e.g. /menu/abc
    slug = Column(String(255), unique=True, nullable=False, index=True)

    name_en = Column(String(255), nullable=False)
    name_kh = Column(String(255), nullable=False)
    description_en = Column(String(2000), nullable=True)
    description_kh = Column(String(2000), nullable=True)
    logo_url = Column(String(1000), nullable=True)

    # Optional: when set, confirmed orders are sent to this Telegram group/chat.
    # Both must be set for notifications to actually send; missing either one
    # just means orders are created without a Telegram message (never blocks
    # order creation itself).
    telegram_bot_token = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(100), nullable=True)

    # Developer-only toggle. When False, staff see a read-only menu (no cart,
    # no add-to-order buttons) — for restaurants that want the digital menu
    # display but still take orders manually on paper. Also enforced
    # server-side in the order-creation endpoint, not just hidden in the UI.
    ordering_enabled = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    group = relationship("Group", back_populates="brands")
    zones = relationship("Zone", back_populates="brand", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="brand", cascade="all, delete-orphan")
    foods = relationship("Food", back_populates="brand", cascade="all, delete-orphan")
    user_links = relationship("UserBrand", back_populates="brand", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="brand", cascade="all, delete-orphan")
