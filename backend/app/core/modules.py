"""
Module-level permissions — the single source of truth for "which role can
see/do what". Each permission is a "<module>.<action>" string. The backend
enforces them (require_permission) and also sends the caller's list to the
frontend via /api/auth/me, so the sidebar and route guards are driven by the
SAME table instead of a second copy that could drift.

To add a future module (inventory, expenses, purchasing ...): add its
permission strings here, grant them to the roles that should have them, and
guard the new endpoints with require_permission(...). Nothing else changes.

Roles:
  level1/2/3  - management tiers; see everything inside their scope
                (level1 all, level2 their group, level3 their brand)
  accountant  - one brand; accounting only
  sales       - one brand; sales only
  staff       - table-side menu/ordering; unchanged, not part of the admin panel
"""
from fastapi import HTTPException, status

from app.db.models.user import User, UserRole

# --- permission names -------------------------------------------------------
DASHBOARD_VIEW = "dashboard.view"
MENU_VIEW = "menu.view"            # open the Brands list / brand page
MENU_MANAGE = "menu.manage"        # foods, categories, zones, prices, brand info
ORDERING_BOARD = "ordering.board"  # cross-brand live order board (managers)
SALES_DESK = "sales.desk"          # single-brand sales desk: orders + checkout (sales role)
ORDERS_VIEW = "orders.view"
ORDERS_MANAGE = "orders.manage"    # change order status
BILLS_VIEW = "bills.view"
BILLS_CREATE = "bills.create"      # check a table out
BILLS_PAY = "bills.pay"
BILLS_VOID = "bills.void"
EXPENSES_VIEW = "expenses.view"
EXPENSES_MANAGE = "expenses.manage"
INVENTORY_VIEW = "inventory.view"
INVENTORY_MANAGE = "inventory.manage"  # stock items, stock in/out/waste/count, recipes
PURCHASING_VIEW = "purchasing.view"
PURCHASING_MANAGE = "purchasing.manage"  # suppliers, create/receive/cancel purchase orders
PURCHASING_PAY = "purchasing.pay"        # record a payment to a supplier
REPORTS_VIEW = "reports.view"      # revenue / billing reports
USERS_MANAGE = "users.manage"
GROUPS_MANAGE = "groups.manage"
CLONE_MENU = "clone.menu"

_MANAGER_BASE = {
    DASHBOARD_VIEW, MENU_VIEW, MENU_MANAGE, ORDERING_BOARD,
    ORDERS_VIEW, ORDERS_MANAGE,
    BILLS_VIEW, BILLS_CREATE, BILLS_PAY, BILLS_VOID,
    REPORTS_VIEW, USERS_MANAGE,
    EXPENSES_VIEW, EXPENSES_MANAGE, INVENTORY_VIEW, INVENTORY_MANAGE,
    PURCHASING_VIEW, PURCHASING_MANAGE, PURCHASING_PAY,
}

ROLE_PERMISSIONS: dict[UserRole, set[str]] = {
    UserRole.LEVEL1: _MANAGER_BASE | {GROUPS_MANAGE, CLONE_MENU},
    UserRole.LEVEL2: _MANAGER_BASE | {CLONE_MENU},
    UserRole.LEVEL3: set(_MANAGER_BASE),
    # Sales: run the floor — see orders, move them along, check tables out and
    # take payment. No reports, no menu editing, no user management.
    UserRole.SALES: {SALES_DESK, ORDERS_VIEW, ORDERS_MANAGE, BILLS_VIEW, BILLS_CREATE, BILLS_PAY},
    # Accountant: the money side — read bills, run reports, correct a mistaken
    # (unpaid) bill. Cannot take orders/payments or touch the menu.
    UserRole.ACCOUNTANT: {
        BILLS_VIEW, BILLS_VOID, REPORTS_VIEW,
        EXPENSES_VIEW, EXPENSES_MANAGE,          # keep the books
        PURCHASING_VIEW, PURCHASING_MANAGE, PURCHASING_PAY,  # suppliers, purchase orders, pay what we owe
        INVENTORY_VIEW,                          # stock value / levels (read only)
    },
    # Staff keep their existing, separate endpoints (menu display, their own
    # brand's orders/bills) — they never enter the admin panel.
    UserRole.STAFF: {ORDERS_VIEW, ORDERS_MANAGE, BILLS_VIEW, BILLS_CREATE, BILLS_PAY, BILLS_VOID},
}

# Roles that live inside the admin panel (AdminLayout) rather than the staff UI.
ADMIN_PANEL_ROLES = (
    UserRole.LEVEL1, UserRole.LEVEL2, UserRole.LEVEL3, UserRole.SALES, UserRole.ACCOUNTANT,
)
# Roles scoped to exactly one brand via a UserBrand link (zone stays NULL for
# all but STAFF).
BRAND_SCOPED_ROLES = (UserRole.LEVEL3, UserRole.STAFF, UserRole.SALES, UserRole.ACCOUNTANT)
# Roles an admin may create at brand level.
BRAND_LEVEL_ROLES = (UserRole.LEVEL3, UserRole.STAFF, UserRole.SALES, UserRole.ACCOUNTANT)
# Roles with a pure "function" (non-management) scope — never see Telegram
# credentials or other management-only brand fields.
LIMITED_ROLES = (UserRole.STAFF, UserRole.SALES, UserRole.ACCOUNTANT)


def permissions_for(user: User) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(user.role, set()))


def has_permission(user: User, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(user.role, set())


def require_permission(user: User, permission: str) -> None:
    if not has_permission(user, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role does not have access to this ({permission}).",
        )
