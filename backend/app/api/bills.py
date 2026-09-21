import uuid
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_staff, get_current_user_scope
from app.core.permissions import assert_can_manage_brand_content
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.order import Order
from app.db.models.bill import Bill, BillItem, BillOrder, BillStatus
from app.db.models.user import UserRole
from app.schemas.bill import BillCreate, BillOut, BillItemOut, BillPay

router = APIRouter(tags=["bills"])


def _assert_bill_access(db: Session, scope: dict, brand_id: uuid.UUID):
    """Same access rule as orders: Level 1/2/3 managing the brand, or Staff for their own brand."""
    user = scope["user"]
    if user.role == UserRole.STAFF:
        if scope["brand_id"] != brand_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this brand's bills")
        return
    assert_can_manage_brand_content(db, user, brand_id)


def _money(value) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_out(bill: Bill) -> BillOut:
    return BillOut(
        id=bill.id,
        invoice_number=bill.invoice_number,
        table_label=bill.table_label,
        zone_name_en=bill.zone.name_en if bill.zone else None,
        zone_name_kh=bill.zone.name_kh if bill.zone else None,
        created_by_name=bill.created_by.full_name if bill.created_by else None,
        subtotal=bill.subtotal,
        discount_amount=bill.discount_amount,
        tax_rate=bill.tax_rate,
        tax_amount=bill.tax_amount,
        total_amount=bill.total_amount,
        status=bill.status,
        payment_method=bill.payment_method,
        paid_at=bill.paid_at,
        notes=bill.notes,
        created_at=bill.created_at,
        items=[
            BillItemOut(
                food_name_en=i.food_name_en,
                food_name_kh=i.food_name_kh,
                unit_price=i.unit_price,
                quantity=i.quantity,
                line_total=i.line_total,
            )
            for i in bill.items
        ],
    )


def _load_bill(db: Session, bill_id: uuid.UUID, brand_id: uuid.UUID) -> Bill | None:
    return (
        db.query(Bill)
        .options(joinedload(Bill.items), joinedload(Bill.zone), joinedload(Bill.created_by))
        .filter(Bill.id == bill_id, Bill.brand_id == brand_id)
        .first()
    )


@router.post("/api/brands/{brand_id}/bills", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(
    brand_id: uuid.UUID,
    payload: BillCreate,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    """
    Checkout a table: folds the given orders into one bill with an
    aggregated line-item list, applies an optional flat discount and tax
    rate, and stamps the brand's next invoice number. The source orders are
    marked billed=True so they can't be billed twice; cancelled orders are
    rejected (nothing to charge for) rather than silently skipped, so staff
    notice a bad order_id instead of getting a bill short a line item.
    """
    _assert_bill_access(db, scope, brand_id)

    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    if not brand.billing_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Billing is turned off for this brand.")

    orders = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.zone))
        .filter(Order.id.in_(payload.order_ids), Order.brand_id == brand_id)
        .all()
    )
    found_ids = {o.id for o in orders}
    missing = [str(oid) for oid in payload.order_ids if oid not in found_ids]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order(s) not found in this brand: {', '.join(missing)}")

    for o in orders:
        if o.status == "cancelled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Order for {o.table_label or 'table'} is cancelled and cannot be billed")
        if o.billed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Order for {o.table_label or 'table'} has already been billed")

    # Aggregate line items across all selected orders, merging identical
    # foods (same name+price) into one summed line rather than one row per
    # order — a customer-facing invoice reads cleaner that way.
    merged: dict[tuple, dict] = {}
    for o in orders:
        for item in o.items:
            key = (item.food_name_en, item.food_name_kh, item.unit_price)
            if key not in merged:
                merged[key] = {"quantity": 0}
            merged[key]["quantity"] += item.quantity

    if not merged:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected orders have no items to bill")

    subtotal = _money(sum(unit_price * data["quantity"] for (_, _, unit_price), data in merged.items()))
    discount = _money(payload.discount_amount)
    if discount > subtotal:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Discount cannot exceed the subtotal")
    taxable_base = subtotal - discount
    tax_amount = _money(taxable_base * payload.tax_rate / Decimal("100"))
    total = _money(taxable_base + tax_amount)

    invoice_number = brand.next_invoice_number
    brand.next_invoice_number = invoice_number + 1

    bill = Bill(
        brand_id=brand_id,
        zone_id=orders[0].zone_id,
        created_by_user_id=scope["user"].id,
        invoice_number=invoice_number,
        table_label=orders[0].table_label,
        subtotal=subtotal,
        discount_amount=discount,
        tax_rate=payload.tax_rate,
        tax_amount=tax_amount,
        total_amount=total,
        status=BillStatus.UNPAID,
        notes=payload.notes,
    )
    bill.items = [
        BillItem(
            food_name_en=name_en,
            food_name_kh=name_kh,
            unit_price=unit_price,
            quantity=data["quantity"],
        )
        for (name_en, name_kh, unit_price), data in merged.items()
    ]
    bill.orders = [BillOrder(order_id=o.id) for o in orders]

    for o in orders:
        o.billed = True

    db.add(bill)
    db.commit()
    db.refresh(bill)

    bill = _load_bill(db, bill.id, brand_id)
    return _to_out(bill)


@router.get("/api/brands/{brand_id}/bills", response_model=list[BillOut])
def list_bills(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    _assert_bill_access(db, scope, brand_id)
    bills = (
        db.query(Bill)
        .options(joinedload(Bill.items), joinedload(Bill.zone), joinedload(Bill.created_by))
        .filter(Bill.brand_id == brand_id)
        .order_by(Bill.created_at.desc())
        .limit(200)
        .all()
    )
    return [_to_out(b) for b in bills]


@router.get("/api/brands/{brand_id}/bills/{bill_id}", response_model=BillOut)
def get_bill(brand_id: uuid.UUID, bill_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """Fetches one bill for printing/viewing as an invoice."""
    _assert_bill_access(db, scope, brand_id)
    bill = _load_bill(db, bill_id, brand_id)
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return _to_out(bill)


@router.patch("/api/brands/{brand_id}/bills/{bill_id}/pay", response_model=BillOut)
def pay_bill(
    brand_id: uuid.UUID,
    bill_id: uuid.UUID,
    payload: BillPay,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    _assert_bill_access(db, scope, brand_id)
    bill = _load_bill(db, bill_id, brand_id)
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    if bill.status != BillStatus.UNPAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Bill is already {bill.status.value}")

    bill.status = BillStatus.PAID
    bill.payment_method = payload.payment_method
    bill.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(bill)
    return _to_out(bill)


@router.patch("/api/brands/{brand_id}/bills/{bill_id}/void", response_model=BillOut)
def void_bill(brand_id: uuid.UUID, bill_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """
    Voids a mistakenly-created bill (e.g. wrong table selected). Never
    allowed once paid — a paid bill must be handled as a refund process
    outside the app, not silently erased. Un-marks the underlying orders so
    they can be billed again correctly.
    """
    _assert_bill_access(db, scope, brand_id)
    bill = (
        db.query(Bill)
        .options(joinedload(Bill.orders))
        .filter(Bill.id == bill_id, Bill.brand_id == brand_id)
        .first()
    )
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    if bill.status == BillStatus.PAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A paid bill cannot be voided here")

    for bo in bill.orders:
        order = db.query(Order).filter(Order.id == bo.order_id).first()
        if order is not None:
            order.billed = False

    bill.status = BillStatus.VOID
    db.commit()
    db.refresh(bill)
    return _to_out(bill)
