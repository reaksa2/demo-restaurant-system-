import uuid
from collections import defaultdict
from datetime import datetime, timedelta, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user_scope
from app.core.modules import REPORTS_VIEW
from app.core.permissions import assert_brand_function_access
from app.db.database import get_db
from app.db.models.bill import Bill, BillStatus, BillOrder
from app.db.models.operations import Expense, StockItem
from app.db.models.order import Order

router = APIRouter(tags=["finance-reports"])


def _range(start: datetime, end: datetime):
    """[start, end) in UTC — the browser converts the user's local dates to UTC instants."""
    return start, end


@router.get("/api/brands/{brand_id}/reports/profit-loss")
def profit_loss(
    brand_id: uuid.UUID,
    start: datetime = Query(..., description="UTC, inclusive"),
    end: datetime = Query(..., description="UTC, exclusive"),
    tz_offset_minutes: int = Query(0, description="viewer's offset from UTC, used only to date the expenses"),
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    """
    Cash-basis profit & loss for one brand over a period:
      revenue  = PAID bills whose paid_at falls in the period
      expenses = expense rows dated in the period (supplier payments included)
      profit   = revenue - expenses
    Also returns what is currently owed to suppliers and the stock on hand
    (both are "as of now", not period figures).
    """
    assert_brand_function_access(db, scope, brand_id, REPORTS_VIEW)
    bills = (
        db.query(Bill).filter(Bill.brand_id == brand_id, Bill.status == BillStatus.PAID,
                              Bill.paid_at >= start, Bill.paid_at < end).all()
    )
    revenue = sum((b.total_amount for b in bills), Decimal("0"))
    by_method: dict[str, Decimal] = defaultdict(Decimal)
    for b in bills:
        by_method[b.payment_method.value if b.payment_method else "other"] += b.total_amount

    local_start = (start + timedelta(minutes=tz_offset_minutes)).date()
    local_end_excl = (end + timedelta(minutes=tz_offset_minutes)).date()
    exp_rows = (
        db.query(Expense.category, func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.brand_id == brand_id, Expense.expense_date >= local_start, Expense.expense_date < local_end_excl)
        .group_by(Expense.category).all()
    )
    expenses_by_category = {c: a for c, a in exp_rows}
    total_expenses = sum(expenses_by_category.values(), Decimal("0"))

    from app.db.models.operations import PurchaseOrder
    owed = db.query(func.coalesce(func.sum(PurchaseOrder.total_amount - PurchaseOrder.paid_amount), 0)).filter(
        PurchaseOrder.brand_id == brand_id, PurchaseOrder.status == "received").scalar()
    stock_value = sum(
        ((i.quantity if i.quantity > 0 else Decimal("0")) * i.avg_cost for i in db.query(StockItem).filter(StockItem.brand_id == brand_id, StockItem.is_active.is_(True)).all()),
        Decimal("0"),
    )
    return {
        "revenue": revenue,
        "bills_paid": len(bills),
        "revenue_by_payment_method": dict(by_method),
        "expenses_total": total_expenses,
        "expenses_by_category": expenses_by_category,
        "net_profit": revenue - total_expenses,
        "owed_to_suppliers": owed,
        "stock_value": stock_value,
    }


@router.get("/api/brands/{brand_id}/reports/sales-by-food")
def sales_by_food(
    brand_id: uuid.UUID, start: datetime = Query(...), end: datetime = Query(...),
    scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db),
):
    """Quantity and revenue per food from PAID bills in the period (best sellers first)."""
    assert_brand_function_access(db, scope, brand_id, REPORTS_VIEW)
    orders = (
        db.query(Order).options(joinedload(Order.items))
        .join(BillOrder, BillOrder.order_id == Order.id).join(Bill, Bill.id == BillOrder.bill_id)
        .filter(Bill.brand_id == brand_id, Bill.status == BillStatus.PAID, Bill.paid_at >= start, Bill.paid_at < end)
        .all()
    )
    agg: dict[str, dict] = {}
    for o in orders:
        for it in o.items:
            row = agg.setdefault(it.food_name_en, {"name_en": it.food_name_en, "name_kh": it.food_name_kh, "quantity": 0, "revenue": Decimal("0")})
            row["quantity"] += it.quantity
            row["revenue"] += it.unit_price * it.quantity
    return sorted(agg.values(), key=lambda r: (-r["quantity"], r["name_en"]))


@router.get("/api/brands/{brand_id}/reports/sales-by-hour")
def sales_by_hour(
    brand_id: uuid.UUID, start: datetime = Query(...), end: datetime = Query(...),
    tz_offset_minutes: int = Query(0), scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db),
):
    """Paid revenue and bill count per hour of the (viewer's local) day — shows the busy hours."""
    assert_brand_function_access(db, scope, brand_id, REPORTS_VIEW)
    bills = db.query(Bill).filter(Bill.brand_id == brand_id, Bill.status == BillStatus.PAID, Bill.paid_at >= start, Bill.paid_at < end).all()
    hours = [{"hour": h, "bills": 0, "revenue": Decimal("0")} for h in range(24)]
    for b in bills:
        h = (b.paid_at + timedelta(minutes=tz_offset_minutes)).hour
        hours[h]["bills"] += 1
        hours[h]["revenue"] += b.total_amount
    return hours
