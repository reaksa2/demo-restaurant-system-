"""Shared stock logic: weighted-average cost and recipe-based deduction on sale."""
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models.operations import StockItem, StockMovement, FoodIngredient
from app.db.models.order import Order

ZERO = Decimal("0")


def apply_movement(
    db: Session, item: StockItem, quantity: Decimal, kind: str, *,
    unit_cost: Decimal | None = None, note: str | None = None, user_id=None,
    ref_purchase_order_id=None, ref_order_id=None,
) -> StockMovement:
    """
    Books one signed movement and keeps item.quantity / avg_cost in step.
    Only stock coming IN with a known cost moves the weighted-average cost;
    anything going out leaves it alone.
    """
    quantity = Decimal(quantity)
    if quantity > 0 and unit_cost is not None:
        on_hand = item.quantity if item.quantity > 0 else ZERO
        total_qty = on_hand + quantity
        if total_qty > 0:
            item.avg_cost = ((on_hand * item.avg_cost) + (quantity * Decimal(unit_cost))) / total_qty
    item.quantity = item.quantity + quantity
    movement = StockMovement(
        brand_id=item.brand_id, stock_item_id=item.id, kind=kind, quantity=quantity,
        unit_cost=unit_cost, note=note, created_by_user_id=user_id,
        ref_purchase_order_id=ref_purchase_order_id, ref_order_id=ref_order_id,
    )
    db.add(movement)
    return movement


def deduct_stock_for_orders(db: Session, orders: list[Order]) -> int:
    """
    For each (non-cancelled) order, use up the recipe ingredients of every
    food sold. Idempotent per order: an order that already has a 'sale'
    movement is skipped, so re-completing an order (or paying a bill after
    manually completing) can never deduct twice. Foods without a recipe are
    simply ignored. Returns the number of movements booked. Does NOT commit.
    """
    booked = 0
    for order in orders:
        if order.status == "cancelled" or getattr(order.status, "value", None) == "cancelled":
            continue
        already = (
            db.query(StockMovement.id)
            .filter(StockMovement.ref_order_id == order.id, StockMovement.kind == "sale")
            .first()
        )
        if already is not None:
            continue
        # sum ingredient need across the order's lines first -> one movement per item
        need: dict[uuid.UUID, Decimal] = {}
        for line in order.items:
            if line.food_id is None:
                continue
            recipe = db.query(FoodIngredient).filter(FoodIngredient.food_id == line.food_id).all()
            for ing in recipe:
                need[ing.stock_item_id] = need.get(ing.stock_item_id, ZERO) + ing.quantity_per_unit * line.quantity
        for item_id, qty in need.items():
            item = db.query(StockItem).filter(StockItem.id == item_id).with_for_update().first()
            if item is None:
                continue
            apply_movement(db, item, -qty, "sale", note="Auto: sold", ref_order_id=order.id)
            booked += 1
    return booked
