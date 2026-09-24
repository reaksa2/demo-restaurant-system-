import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)

    # Optional self-reference so a category can be a subgroup within another
    # category of the same brand (e.g. "Special" -> "Steamed/Soup" -> foods).
    # NULL means this is a top-level category.
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=True)

    name_en = Column(String(255), nullable=False)
    name_kh = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    # Marks a top-level category (e.g. "Drinks") whose foods should be left
    # out of the menu's "All" tab — they're still fully browsable under their
    # own category tab, just not mixed into the default flat view. Meaningful
    # only on a top-level category; the menu display resolves a subcategory's
    # own top-level ancestor to decide whether to exclude it, so flagging a
    # subcategory itself has no effect (the admin UI only exposes this toggle
    # for top-level categories to avoid that confusion).
    is_drink = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    brand = relationship("Brand", back_populates="categories")
    foods = relationship("Food", back_populates="category")
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent", cascade="all, delete-orphan")
