import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user_scope
from app.core.modules import INVENTORY_VIEW, INVENTORY_MANAGE
from app.core.permissions import assert_brand_function_access
from app.core.stock import apply_movement
from app.db.database import get_db
from app.db.models.food import Food
from app.db.models.operations import StockItem, StockMovement, FoodIngredient
from app.schemas.operations import (
    StockItemCreate, StockItemUpdate, StockItemOut, StockMovementCreate, StockMovementOut,
    RecipeLine, RecipeLineOut,
)

router = APIRouter(tags=["inventory"])


def _out(i: StockItem) -> StockItemOut:
    return StockItemOut(
        id=i.id, brand_id=i.brand_id, name_en=i.name_en, name_kh=i.name_kh, unit=i.unit,
        quantity=i.quantity, reorder_level=i.reorder_level, avg_cost=i.avg_cost,
        stock_value=(i.quantity if i.quantity > 0 else Decimal("0")) * i.avg_cost,
        low_stock=i.is_active and i.quantity <= i.reorder_level and i.reorder_level > 0,
        is_active=i.is_active,
    )


def _item(db: Session, brand_id: uuid.UUID, item_id: uuid.UUID, lock: bool = False) -> StockItem:
    q = db.query(StockItem).filter(StockItem.id == item_id, StockItem.brand_id == brand_id)
    if lock:
        q = q.with_for_update()
    item = q.first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    return item


@router.get("/api/brands/{brand_id}/stock-items", response_model=list[StockItemOut])
def list_items(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, INVENTORY_VIEW)
    rows = db.query(StockItem).filter(StockItem.brand_id == brand_id).order_by(StockItem.name_en).all()
    return [_out(r) for r in rows]


@router.post("/api/brands/{brand_id}/stock-items", response_model=StockItemOut, status_code=status.HTTP_201_CREATED)
def create_item(brand_id: uuid.UUID, payload: StockItemCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, INVENTORY_MANAGE)
    item = StockItem(
        brand_id=brand_id, name_en=payload.name_en.strip(), name_kh=payload.name_kh, unit=payload.unit.strip(),
        reorder_level=payload.reorder_level, quantity=0, avg_cost=0,
    )
    db.add(item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A stock item with that name already exists")
    if payload.opening_quantity > 0:
        apply_movement(db, item, payload.opening_quantity, "stock_in", unit_cost=payload.opening_unit_cost,
                       note="Opening balance", user_id=scope["user"].id)
    db.commit()
    db.refresh(item)
    return _out(item)


@router.put("/api/brands/{brand_id}/stock-items/{item_id}", response_model=StockItemOut)
def update_item(brand_id: uuid.UUID, item_id: uuid.UUID, payload: StockItemUpdate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, INVENTORY_MANAGE)
    item = _item(db, brand_id, item_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v.strip() if isinstance(v, str) and k in ("name_en", "unit") else v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A stock item with that name already exists")
    db.refresh(item)
    return _out(item)


@router.delete("/api/brands/{brand_id}/stock-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(brand_id: uuid.UUID, item_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """Only an item with no history can be deleted; otherwise deactivate it (keeps the ledger intact)."""
    assert_brand_function_access(db, scope, brand_id, INVENTORY_MANAGE)
    item = _item(db, brand_id, item_id)
    if db.query(StockMovement.id).filter(StockMovement.stock_item_id == item.id).first() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This item has stock history — deactivate it instead of deleting.")
    db.delete(item)
    db.commit()


@router.get("/api/brands/{brand_id}/stock-items/{item_id}/movements", response_model=list[StockMovementOut])
def list_movements(brand_id: uuid.UUID, item_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, INVENTORY_VIEW)
    _item(db, brand_id, item_id)
    rows = (
        db.query(StockMovement).filter(StockMovement.stock_item_id == item_id)
        .order_by(StockMovement.created_at.desc()).limit(200).all()
    )
    return [StockMovementOut(id=m.id, stock_item_id=m.stock_item_id, kind=m.kind, quantity=m.quantity,
                             unit_cost=m.unit_cost, note=m.note, created_at=m.created_at) for m in rows]


@router.post("/api/brands/{brand_id}/stock-items/{item_id}/movements", response_model=StockItemOut, status_code=status.HTTP_201_CREATED)
def add_movement(brand_id: uuid.UUID, item_id: uuid.UUID, payload: StockMovementCreate, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    assert_brand_function_access(db, scope, brand_id, INVENTORY_MANAGE)
    item = _item(db, brand_id, item_id, lock=True)
    uid = scope["user"].id
    if payload.kind == "stock_in":
        if payload.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be more than 0")
        apply_movement(db, item, payload.quantity, "stock_in", unit_cost=payload.unit_cost, note=payload.note, user_id=uid)
    elif payload.kind in ("stock_out", "waste"):
        if payload.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be more than 0")
        apply_movement(db, item, -payload.quantity, payload.kind, note=payload.note, user_id=uid)
    elif payload.kind == "adjustment":
        delta = payload.quantity - item.quantity
        if delta == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Counted quantity equals the current quantity — nothing to adjust")
        apply_movement(db, item, delta, "adjustment", note=payload.note or "Stock count", user_id=uid)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind must be stock_in, stock_out, waste or adjustment")
    db.commit()
    db.refresh(item)
    return _out(item)


# ---------------- recipes ----------------
def _recipe_out(lines: list[FoodIngredient]) -> list[RecipeLineOut]:
    return [RecipeLineOut(stock_item_id=l.stock_item_id, stock_item_name=l.stock_item.name_en,
                          unit=l.stock_item.unit, quantity_per_unit=l.quantity_per_unit) for l in lines]


@router.get("/api/brands/{brand_id}/recipes")
def all_recipes(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """{food_id: [lines]} for every food in the brand that has a recipe."""
    assert_brand_function_access(db, scope, brand_id, INVENTORY_VIEW)
    rows = (
        db.query(FoodIngredient).join(Food, Food.id == FoodIngredient.food_id)
        .options(joinedload(FoodIngredient.stock_item)).filter(Food.brand_id == brand_id).all()
    )
    out: dict[str, list] = {}
    for line in rows:
        out.setdefault(str(line.food_id), []).append(_recipe_out([line])[0])
    return out


@router.put("/api/brands/{brand_id}/foods/{food_id}/recipe", response_model=list[RecipeLineOut])
def set_recipe(brand_id: uuid.UUID, food_id: uuid.UUID, lines: list[RecipeLine], scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """Replaces the whole recipe of one food (send [] to clear it)."""
    assert_brand_function_access(db, scope, brand_id, INVENTORY_MANAGE)
    if db.query(Food).filter(Food.id == food_id, Food.brand_id == brand_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    ids = [l.stock_item_id for l in lines]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each ingredient can appear only once")
    if ids and db.query(StockItem).filter(StockItem.id.in_(ids), StockItem.brand_id == brand_id).count() != len(ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="An ingredient is not a stock item of this brand")
    db.query(FoodIngredient).filter(FoodIngredient.food_id == food_id).delete()
    for l in lines:
        db.add(FoodIngredient(food_id=food_id, stock_item_id=l.stock_item_id, quantity_per_unit=l.quantity_per_unit))
    db.commit()
    rows = db.query(FoodIngredient).options(joinedload(FoodIngredient.stock_item)).filter(FoodIngredient.food_id == food_id).all()
    return _recipe_out(rows)
