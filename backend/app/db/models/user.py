import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Boolean, DateTime, Enum, Integer
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
    username = Column(String(50), unique=True, nullable=True, index=True)  # optional; login accepts either
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Configurable multi-device login: how many devices this account may be
    # logged into at the same time. Enforced at login (app/api/auth.py) by
    # evicting the oldest UserSession row once this cap is exceeded.
    max_devices = Column(Integer, nullable=False, default=1)

    # Profile picture, uploaded via /api/images/upload and set via /api/auth/me.
    avatar_url = Column(String(1000), nullable=True)

    # LEVEL2 users: assignment to exactly one group (enforced in service layer,
    # modeled as many-to-many at the DB level for flexibility).
    group_links = relationship("UserGroup", back_populates="user", cascade="all, delete-orphan")

    # LEVEL3 users: assignment to exactly one brand, zone_id is NULL.
    # STAFF users: assignment to exactly one brand; zone_id is set only for a
    # staff account locked to a single zone. When zone_id is NULL, the staff
    # account can browse every zone in its brand via tabs on the staff menu.
    brand_links = relationship("UserBrand", back_populates="user", cascade="all, delete-orphan")

    # One row per currently logged-in device. Replaces the old single
    # active_session_id column now that a user can hold several sessions
    # at once, up to max_devices.
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
