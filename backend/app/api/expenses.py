import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user_scope
from app.core.modules import EXPENSES_VIEW, EXPENSES_MANAGE
from app.core.permissions import assert_brand_function_access
from app.db.database import get_db
from app.db.models.operations import Expense, Supplier
from app.schemas.operations import ExpenseCreate, ExpenseUpdate, ExpenseOut, EXPENSE_CATEGORIES

router = APIRouter(tags=["expenses"])

PAYMENT_METHODS = {"cash", "bank", "card", "qr", "other"}


def _out(e: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=e.id, brand_id=e.brand_id, expense_date=e.expense_date, category=e.category,
        description=e.description, amount=e.amount, payment_method=e.payment_method,
        supplier_id=e.supplier_id, supplier_name=e.supplier.name if e.supplier else None,
        purchase_order_id=e.purchase_order_id,
        created_by_name=e.created_by.full_name if e.created_by else None,
        created_at=e.created_at,
    )


def _check_method(method: Optional[str]):
    if method is not None and method not in PAYMENT_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"payment_method must be one of {sorted(PAYMENT_METHODS)}")


def _check_supplier(db: Session, brand_id: uuid.UUID, supplier_id: Optional[uuid.UUID]):
    if supplier_id is not None and db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.brand_id == brand_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found in this brand")


@router.get("/api/expense-categories")
def expense_categories(scope: dict = Depends(get_current_user_scope)):
    return EXPENSE_CATEGORIES


@router.get("/api/brands/{brand_id}/expenses", response_model=list[ExpenseOut])
def list_expenses(
    brand_id: uuid.UUID,
    start: Optional[date] = Query(default=None),
    end: Optional[date] = Query(default=None, description="inclusive"),
    category: Optional[str] = None,
    scope: dict = Depends(get_current_user_scope),
    db: Session = Depends(get_db),
):
    assert_brand_function_access(db, scope, brand_id, EXPENSES_VIEW)
    q = db.query(Expense).options(joinedload(Expense.supplier), joinedload(Expense.created_by)).filter(Expense.brand_id == brand_id)
    if start:
        q = q.filter(Expense.expense_date >= start)
    if end:
        q = q.filter(Expense.expense_date <= end)
    if category:
        q = q.filter(Expense.category == category)
    rows = q.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).limit(1000).all()
    return [_out(r) for r in rows]


@router.post("/api/brands/{brand_id}/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(brand_id: uuid.UUID, payload: ExpenseCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, EXPENSES_MANAGE)
    _check_method(payload.payment_method)
    _check_supplier(db, brand_id, payload.supplier_id)
    e = Expense(brand_id=brand_id, created_by_user_id=scope["user"].id, **payload.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return _out(e)


@router.put("/api/brands/{brand_id}/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(brand_id: uuid.UUID, expense_id: uuid.UUID, payload: ExpenseUpdate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, EXPENSES_MANAGE)
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.brand_id == brand_id).first()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if e.purchase_order_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This expense is a supplier payment — change it from Purchasing, not here.")
    data = payload.model_dump(exclude_unset=True)
    _check_method(data.get("payment_method"))
    if "supplier_id" in data:
        _check_supplier(db, brand_id, data["supplier_id"])
    for k, v in data.items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return _out(e)


@router.delete("/api/brands/{brand_id}/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(brand_id: uuid.UUID, expense_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, EXPENSES_MANAGE)
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.brand_id == brand_id).first()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if e.purchase_order_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This expense is a supplier payment — it can't be deleted here.")
    db.delete(e)
    db.commit()
