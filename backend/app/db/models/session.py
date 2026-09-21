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

    # Mirrors the "exp" claim baked into this device's JWT at login. Without
    # this, a browser closed without logging out (JWT quietly expires client
    # side) would leave its row here forever — never released, permanently
    # occupying one of the account's max_devices slots — since nothing ever
    # deletes a session on a timer. Login and every authenticated request
    # both purge rows past this timestamp, so an expired device's slot is
    # freed automatically instead of only when a cap eviction happens to
    # push it out.
    #
    # NULL means this device's session never expires (the account has
    # never_expire set on User) — such rows are always treated as active and
    # are never picked up by the expiry-purge queries.
    expires_at = Column(DateTime, nullable=True)

    # Captured at login (app/api/auth.py) purely so an admin can tell devices
    # apart on the Users page (e.g. "Chrome on Android" vs "Safari on iPad")
    # and decide which one to revoke. Never used for auth decisions.
    user_agent = Column(String(500), nullable=True)
    ip_address = Column(String(64), nullable=True)

    # Updated opportunistically (throttled, not on every single request — see
    # app/api/deps.py) so the admin view can show roughly how recently a
    # device was actually used, not just when it first logged in.
    last_seen_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")
