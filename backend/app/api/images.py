import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_scope
from app.core.config import settings
from app.core.permissions import require_roles
from app.core.r2_storage import upload_to_r2
from app.db.database import get_db
from app.db.models.user import UserRole

router = APIRouter(prefix="/api/images", tags=["images"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
CONTENT_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    """
    Uploads a brand logo or food photo and returns its URL. Only the URL is
    ever stored on brand/food rows in Postgres — never the file bytes
    themselves (spec section 16).

    Uses Cloudflare R2 when configured (settings.r2_configured) — this is
    the production path, since R2 storage persists independently of the
    backend's own disk. Falls back to local disk only when R2 isn't
    configured, which is fine for local development but NEVER durable in
    production (Render wipes local disk on every redeploy/restart).
    """
    user = scope["user"]
    require_roles(user, UserRole.LEVEL1, UserRole.LEVEL2, UserRole.LEVEL3)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 5MB)")

    if settings.r2_configured:
        try:
            url = upload_to_r2(contents, ext, CONTENT_TYPES[ext])
        except Exception:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Image storage upload failed. Please try again.")
        return {"url": url}

    # Local-disk fallback (dev only)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    url = f"{settings.UPLOAD_URL_PREFIX}/{filename}"
    return {"url": url}
