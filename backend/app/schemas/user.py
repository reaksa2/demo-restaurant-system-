import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.db.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    username: Optional[str] = None
    password: str = Field(min_length=8)
    full_name: str
    role: UserRole

    # Scope assignment — required depending on role, validated in the endpoint:
    #   LEVEL2 -> group_id
    #   LEVEL3 -> brand_id
    #   STAFF  -> brand_id, and optionally zone_id (leave unset/null for a
    #             staff account that can browse every zone in the brand via
    #             tabs; set it to lock the account to a single zone)
    group_id: Optional[uuid.UUID] = None
    brand_id: Optional[uuid.UUID] = None
    zone_id: Optional[uuid.UUID] = None

    # How many devices this account may be logged into at once.
    max_devices: int = Field(default=1, ge=1, le=20)

    # When true, this account's login sessions never time out on their own
    # (see UserSession.expires_at / app/api/auth.py). Use sparingly — it
    # means a device stays signed in until someone explicitly revokes it.
    never_expire: bool = False


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)
    is_active: Optional[bool] = None
    max_devices: Optional[int] = Field(default=None, ge=1, le=20)
    never_expire: Optional[bool] = None
    # Re-assign a staff member's zone access. Only meaningful for STAFF.
    # Sent as null to switch the account to "all zones" (tabs); sent as a
    # zone id to lock it to just that zone. Omit the field entirely to leave
    # the current zone access unchanged (see UsersPage.jsx / users.py, which
    # always include this key explicitly for staff so null is distinguishable
    # from "not provided").
    zone_id: Optional[uuid.UUID] = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: Optional[str] = None
    full_name: str
    role: UserRole
    is_active: bool
    avatar_url: Optional[str] = None
    group_id: Optional[uuid.UUID] = None
    brand_id: Optional[uuid.UUID] = None
    zone_id: Optional[uuid.UUID] = None
    max_devices: int
    active_sessions: int = 0  # how many devices are CURRENTLY logged in, out of max_devices
    never_expire: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
