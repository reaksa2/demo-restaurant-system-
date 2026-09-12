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
    #   STAFF  -> brand_id + zone_id
    group_id: Optional[uuid.UUID] = None
    brand_id: Optional[uuid.UUID] = None
    zone_id: Optional[uuid.UUID] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)
    is_active: Optional[bool] = None
    zone_id: Optional[uuid.UUID] = None  # allow re-assigning a staff member's zone


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
    created_at: datetime

    class Config:
        from_attributes = True
