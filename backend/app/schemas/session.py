import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserSessionOut(BaseModel):
    id: uuid.UUID
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime  # when this device first logged in
    last_seen_at: Optional[datetime] = None  # most recent authenticated request from it
    expires_at: Optional[datetime] = None  # None = never expires (never_expire account)

    class Config:
        from_attributes = True
