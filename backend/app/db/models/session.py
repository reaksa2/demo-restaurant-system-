import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class UserSession(Base):
    """
    One row per device currently logged into a user's account. Login
    (app/api/auth.py) inserts a new row and, if the user is now over their
    configured max_devices, deletes the oldest row(s) so the count never
    exceeds the cap — the newest login always succeeds, the least-recently
    logged-in device is the one signed out. Every authenticated request
    (app/api/deps.py) checks that its token's session id still has a
    matching row here; logout deletes just that one row.
    """
    __tablename__ = "user_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")
