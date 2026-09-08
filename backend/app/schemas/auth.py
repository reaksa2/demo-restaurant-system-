import uuid
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.db.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserInfo(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    avatar_url: Optional[str] = None
    group_id: Optional[uuid.UUID] = None   # set for LEVEL2
    brand_id: Optional[uuid.UUID] = None   # set for LEVEL3 and STAFF
    zone_id: Optional[uuid.UUID] = None    # set for STAFF only

    class Config:
        from_attributes = True


class MyProfileUpdate(BaseModel):
    """Any authenticated user can update their own name/avatar this way — no role check needed."""
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
