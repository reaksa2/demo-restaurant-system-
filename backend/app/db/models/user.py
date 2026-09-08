import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Boolean, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class UserRole(str, enum.Enum):
    LEVEL1 = "level1"    # Developer / system owner — full access
    LEVEL2 = "level2"    # Group manager — one group, all its brands
    LEVEL3 = "level3"    # Brand manager — one brand only
    STAFF = "staff"      # Normal staff — one brand + one zone, menu display only


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    active_session_id = Column(String(64), nullable=True)
    # LEVEL2 users: assignment to exactly one group (enforced in service layer,
    # modeled as many-to-many at the DB level for flexibility).
    group_links = relationship("UserGroup", back_populates="user", cascade="all, delete-orphan")

    # LEVEL3 users: assignment to exactly one brand, zone_id is NULL.
    # STAFF users: assignment to exactly one brand, zone_id is REQUIRED.
    brand_links = relationship("UserBrand", back_populates="user", cascade="all, delete-orphan")
