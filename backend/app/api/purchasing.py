import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user_scope
from app.core.modules import PURCHASING_VIEW, PURCHASING_MANAGE, PURCHASING_PAY
from app.core.permissions import assert_brand_function_access
from app.core.stock import apply_movement
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.operations import Supplier, PurchaseOrder, PurchaseItem, StockItem, Expense
from app.schemas.operations import (
    SupplierCreate, SupplierUpdate, SupplierOut, PurchaseOrderCreate, PurchaseOrderOut,
    PurchaseItemOut, PurchaseStatusUpdate, PurchasePaymentCreate,
)

router = APIRouter(tags=["purchasing"])

PAY_METHODS = {"cash", "bank", "card", "qr", "other"}
_ALLOWED = {"draft": {"ordered", "cancelled"}, "ordered": {"received", "cancelled"}}


def _po_out(po: PurchaseOrder) -> PurchaseOrderOut:
    return PurchaseOrderOut(
        id=po.id, brand_id=po.brand_id, po_number=po.po_number, supplier_id=po.supplier_id,
        supplier_name=po.supplier.name if po.supplier else None, status=po.status, note=po.note,
        total_amount=po.total_amount, paid_amount=po.paid_amount,
        # cancelled orders owe nothing
        balance=Decimal("0") if po.status == "cancelled" else po.total_amount - po.paid_amount,
        items=[PurchaseItemOut(stock_item_id=i.stock_item_id, item_name=i.item_name, unit=i.unit,
                               quantity=i.quantity, unit_cost=i.unit_cost, line_total=i.line_total) for i in po.items],
        created_at=po.created_at, received_at=po.received_at,
    )


def _load_po(db: Session, brand_id: uuid.UUID, po_id: uuid.UUID, lock: bool = False) -> PurchaseOrder:
    q = db.query(PurchaseOrder).options(joinedload(PurchaseOrder.items), joinedload(PurchaseOrder.supplier)).filter(
        PurchaseOrder.id == po_id, PurchaseOrder.brand_id == brand_id)
    if lock:
        q = q.with_for_update(of=PurchaseOrder)
    po = q.first()
    if po is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return po


# ---------------- suppliers ----------------
def _supplier_out(db: Session, s: Supplier) -> SupplierOut:
    owed = (
        db.query(func.coalesce(func.sum(PurchaseOrder.total_amount - PurchaseOrder.paid_amount), 0))
        .filter(PurchaseOrder.supplier_id == s.id, PurchaseOrder.status == "received").scalar()
    )
    return SupplierOut(id=s.id, name=s.name, phone=s.phone, note=s.note, is_active=s.is_active, balance_owed=owed)


@router.get("/api/brands/{brand_id}/suppliers", response_model=list[SupplierOut])
def list_suppliers(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, PURCHASING_VIEW)
    rows = db.query(Supplier).filter(Supplier.brand_id == brand_id).order_by(Supplier.name).all()
    return [_supplier_out(db, s) for s in rows]


@router.post("/api/brands/{brand_id}/suppliers", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
def create_supplier(brand_id: uuid.UUID, payload: SupplierCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, PURCHASING_MANAGE)
    s = Supplier(brand_id=brand_id, **payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _supplier_out(db, s)


@router.put("/api/brands/{brand_id}/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(brand_id: uuid.UUID, supplier_id: uuid.UUID, payload: SupplierUpdate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, PURCHASING_MANAGE)
    s = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.brand_id == brand_id).first()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _supplier_out(db, s)


# ---------------- purchase orders ----------------
@router.get("/api/brands/{brand_id}/purchase-orders", response_model=list[PurchaseOrderOut])
def list_pos(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, PURCHASING_VIEW)
    rows = (
        db.query(PurchaseOrder).options(joinedload(PurchaseOrder.items), joinedload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.brand_id == brand_id).order_by(PurchaseOrder.created_at.desc()).limit(300).all()
    )
    return [_po_out(p) for p in rows]


@router.post("/api/brands/{brand_id}/purchase-orders", response_model=PurchaseOrderOut, status_code=status.HTTP_201_CREATED)
def create_po(brand_id: uuid.UUID, payload: PurchaseOrderCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, PURCHASING_MANAGE)
    if payload.supplier_id is not None and db.query(Supplier).filter(Supplier.id == payload.supplier_id, Supplier.brand_id == brand_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found in this brand")
    ids = [l.stock_item_id for l in payload.items]
    items = {i.id: i for i in db.query(StockItem).filter(StockItem.id.in_(ids), StockItem.brand_id == brand_id).all()}
    if any(i not in items for i in ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="A line refers to a stock item that isn't in this brand")

    # lock the brand row so two people creating a PO at once get distinct numbers
    db.query(Brand).filter(Brand.id == brand_id).with_for_update().first()
    next_no = (db.query(func.coalesce(func.max(PurchaseOrder.po_number), 0)).filter(PurchaseOrder.brand_id == brand_id).scalar() or 0) + 1

    po = PurchaseOrder(brand_id=brand_id, supplier_id=payload.supplier_id, po_number=next_no, note=payload.note,
                       status="draft", created_by_user_id=scope["user"].id)
    total = Decimal("0")
    for l in payload.items:
        it = items[l.stock_item_id]
        po.items.append(PurchaseItem(stock_item_id=it.id, item_name=it.name_en, unit=it.unit, quantity=l.quantity, unit_cost=l.unit_cost))
        total += l.quantity * l.unit_cost
    po.total_amount = total.quantize(Decimal("0.01"))
    db.add(po)
    db.commit()
    return _po_out(_load_po(db, brand_id, po.id))


@router.patch("/api/brands/{brand_id}/purchase-orders/{po_id}/status", response_model=PurchaseOrderOut)
def set_po_status(brand_id: uuid.UUID, po_id: uuid.UUID, payload: PurchaseStatusUpdate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, PURCHASING_MANAGE)
    po = _load_po(db, brand_id, po_id, lock=True)
    if payload.status not in _ALLOWED.get(po.status, set()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A {po.status} purchase order can't become {payload.status}")
    if payload.status == "cancelled" and po.paid_amount > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payments were already recorded against this order, it can't be cancelled")
    if payload.status == "received":
        for line in po.items:
            if line.stock_item_id is None:
                continue
            item = db.query(StockItem).filter(StockItem.id == line.stock_item_id).with_for_update().first()
            if item is None:
                continue
            apply_movement(db, item, line.quantity, "purchase", unit_cost=line.unit_cost,
                           note=f"PO #{po.po_number}", user_id=scope["user"].id, ref_purchase_order_id=po.id)
        po.received_at = datetime.utcnow()
    po.status = payload.status
    db.commit()
    return _po_out(_load_po(db, brand_id, po_id))


@router.post("/api/brands/{brand_id}/purchase-orders/{po_id}/payments", response_model=PurchaseOrderOut)
def pay_po(brand_id: uuid.UUID, po_id: uuid.UUID, payload: PurchasePaymentCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """Pays (part of) what's owed. Books an Expense in the same step so the P&L stays right."""
    assert_brand_function_access(db, scope, brand_id, PURCHASING_PAY)
    if payload.payment_method not in PAY_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"payment_method must be one of {sorted(PAY_METHODS)}")
    po = _load_po(db, brand_id, po_id, lock=True)
    if po.status != "received":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only a received purchase order can be paid")
    balance = po.total_amount - po.paid_amount
    if payload.amount > balance:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Payment is more than the balance owed ({balance})")
    po.paid_amount = po.paid_amount + payload.amount
    db.add(Expense(
        brand_id=brand_id, expense_date=payload.payment_date or date.today(), category="purchases",
        description=f"Payment for PO #{po.po_number}", amount=payload.amount, payment_method=payload.payment_method,
        supplier_id=po.supplier_id, purchase_order_id=po.id, created_by_user_id=scope["user"].id,
    ))
    db.commit()
    return _po_out(_load_po(db, brand_id, po_id))
