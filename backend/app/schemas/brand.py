import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class BrandCreate(BaseModel):
    group_id: uuid.UUID
    slug: str
    name_en: str
    name_kh: str
    description_en: Optional[str] = None
    description_kh: Optional[str] = None
    logo_url: Optional[str] = None


class BrandUpdate(BaseModel):
    """
    Level 2/3 can update brand info, but never group_id or slug —
    reassigning a brand to another group / renaming its public URL
    is a Level 1 (system owner) action only.
    """
    name_en: Optional[str] = None
    name_kh: Optional[str] = None
    description_en: Optional[str] = None
    description_kh: Optional[str] = None
    logo_url: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None


class BrandAdminUpdate(BrandUpdate):
    """Level 1 only: also allows moving a brand between groups, changing its slug,
    or toggling whether staff can take orders through the app at all (vs. a
    read-only menu display with orders taken manually on paper)."""
    group_id: Optional[uuid.UUID] = None
    slug: Optional[str] = None
    ordering_enabled: Optional[bool] = None


class BrandOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    slug: str
    name_en: str
    name_kh: str
    description_en: Optional[str] = None
    description_kh: Optional[str] = None
    logo_url: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    ordering_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True
