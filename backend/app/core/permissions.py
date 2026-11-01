"""
Central authorization logic.

Every rule from the spec is enforced HERE, on the backend, not just hidden
in the React UI:
  - LEVEL1 -> full system access
  - LEVEL2 -> their one assigned group + every brand inside it
  - LEVEL3 -> their one assigned brand only
  - STAFF  -> their one assigned brand + their one assigned zone only

Endpoints call these helpers explicitly; a failed check always raises
HTTP 403, never silently filters data.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.user import User, UserRole
from app.db.models.brand import Brand
from app.db.models.associations import UserGroup, UserBrand


def get_user_group_id(db: Session, user: User) -> uuid.UUID | None:
    """The one group a LEVEL2 user is assigned to, if any."""
    link = db.query(UserGroup).filter(UserGroup.user_id == user.id).first()
    return link.group_id if link else None


def get_user_brand_link(db: Session, user: User) -> UserBrand | None:
    """The one brand (+ zone, for STAFF) a LEVEL3/STAFF user is assigned to, if any."""
    return db.query(UserBrand).filter(UserBrand.user_id == user.id).first()


def require_roles(user: User, *allowed_roles: UserRole):
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This action requires one of roles: {[r.value for r in allowed_roles]}",
        )


def require_level1(user: User):
    require_roles(user, UserRole.LEVEL1)


def assert_group_access(db: Session, user: User, group_id: uuid.UUID):
    """LEVEL1 can access any group. LEVEL2 can access only their own group."""
    if user.role == UserRole.LEVEL1:
        return
    if user.role == UserRole.LEVEL2:
        assigned_group_id = get_user_group_id(db, user)
        if assigned_group_id == group_id:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this group")


def assert_brand_access(db: Session, user: User, brand_id: uuid.UUID, *, allow_staff: bool = False):
    """
    LEVEL1        -> any brand
    LEVEL2        -> any brand belonging to their assigned group
    LEVEL3        -> only their assigned brand
    STAFF         -> only their assigned brand, and only if allow_staff=True
                     (staff can READ the menu for their brand, never manage it)
    """
    if user.role == UserRole.LEVEL1:
        return

    if user.role == UserRole.LEVEL2:
        assigned_group_id = get_user_group_id(db, user)
        brand = db.query(Brand).filter(Brand.id == brand_id).first()
        if brand is not None and assigned_group_id is not None and brand.group_id == assigned_group_id:
            return

    if user.role == UserRole.LEVEL3:
        link = get_user_brand_link(db, user)
        if link is not None and link.brand_id == brand_id:
            return

    # STAFF and the function-only roles (sales/accountant) get READ access to
    # their own brand's basic info when the caller allows it; what they can
    # actually do beyond that is gated per-module (core/modules.py).
    if user.role in (UserRole.STAFF, UserRole.SALES, UserRole.ACCOUNTANT) and allow_staff:
        link = get_user_brand_link(db, user)
        if link is not None and link.brand_id == brand_id:
            return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this brand")


def assert_can_manage_brand_content(db: Session, user: User, brand_id: uuid.UUID):
    """
    Managing foods/categories/prices/images/availability for a brand:
    allowed for LEVEL1, LEVEL2 (their group's brands), LEVEL3 (their own brand).
    NEVER allowed for STAFF.
    """
    require_roles(user, UserRole.LEVEL1, UserRole.LEVEL2, UserRole.LEVEL3)
    assert_brand_access(db, user, brand_id, allow_staff=False)


def assert_brand_function_access(db: Session, scope: dict, brand_id: uuid.UUID, permission: str):
    """
    Orders / bills: the caller needs `permission` for their role AND the brand
    must be inside their scope. Managers (L1/2/3) are scoped exactly like
    content management; staff/sales/accountant are locked to their one brand.
    """
    from app.core.modules import require_permission  # local import: modules imports models too

    user = scope["user"]
    require_permission(user, permission)
    if user.role in (UserRole.STAFF, UserRole.SALES, UserRole.ACCOUNTANT):
        if scope["brand_id"] != brand_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this brand")
        return
    assert_can_manage_brand_content(db, user, brand_id)
