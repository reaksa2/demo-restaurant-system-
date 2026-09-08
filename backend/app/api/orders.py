import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_staff, get_current_user_scope
from app.core.permissions import assert_can_manage_brand_content
from app.core.telegram import send_telegram_message, format_order_message
from app.db.database import get_db
from app.db.models.brand import Brand
from app.db.models.food import Food
from app.db.models.food_price import FoodPrice
from app.db.models.order import Order, OrderItem
from app.db.models.zone import Zone
from app.schemas.order import OrderCreate, OrderOut, OrderItemOut

router = APIRouter(tags=["orders"])


def _to_out(order: Order) -> OrderOut:
    return OrderOut(
        id=order.id,
        table_label=order.table_label,
        zone_name_en=order.zone.name_en if order.zone else None,
        zone_name_kh=order.zone.name_kh if order.zone else None,
        placed_by_name=order.placed_by.full_name if order.placed_by else None,
        total_amount=order.total_amount,
        telegram_notified=order.telegram_notified,
        created_at=order.created_at,
        items=[
            OrderItemOut(
                food_name_en=i.food_name_en,
                food_name_kh=i.food_name_kh,
                unit_price=i.unit_price,
                quantity=i.quantity,
                line_total=i.line_total,
            )
            for i in order.items
        ],
    )


@router.post("/api/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(payload: OrderCreate, scope: dict = Depends(require_staff), db: Session = Depends(get_db)):
    """
    Staff-only. Always scoped to the logged-in staff member's own brand and
    zone — there is no brand_id/zone_id in the request body, so a staff
    member can never place an order for a brand or zone other than their own.
    Prices are resolved server-side from the CURRENT price for their zone,
    same trust boundary as the menu endpoint — never taken from the client.
    """
    brand_id = scope["brand_id"]
    zone_id = scope["zone_id"]
    user = scope["user"]

    if not payload.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order must include at least one item")

    brand = db.query(Brand).filter(Brand.id == brand_id).first()

    order_items: list[OrderItem] = []
    total = 0
    message_lines = []

    for line in payload.items:
        food = db.query(Food).filter(Food.id == line.food_id, Food.brand_id == brand_id).first()
        if food is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Food {line.food_id} not found in your brand")
        if not food.is_available:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'"{food.name_en}" is not available')

        price_row = db.query(FoodPrice).filter(FoodPrice.food_id == food.id, FoodPrice.zone_id == zone_id).first()
        if price_row is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'"{food.name_en}" has no price set for your zone')

        unit_price = price_row.effective_price
        line_total = unit_price * line.quantity
        total += line_total

        order_items.append(
            OrderItem(
                food_id=food.id,
                food_name_en=food.name_en,
                food_name_kh=food.name_kh,
                unit_price=unit_price,
                quantity=line.quantity,
            )
        )
        message_lines.append({"name_en": food.name_en, "unit_price": float(unit_price), "quantity": line.quantity})

    order = Order(
        brand_id=brand_id,
        zone_id=zone_id,
        placed_by_user_id=user.id,
        table_label=payload.table_label,
        total_amount=total,
        telegram_notified="not_configured",
    )
    order.items = order_items
    db.add(order)
    db.commit()
    db.refresh(order)

    # Best-effort Telegram notification — never blocks or fails the order itself.
    if brand.telegram_bot_token and brand.telegram_chat_id:
        zone = db.query(Zone).filter(Zone.id == zone_id).first()
        text = format_order_message(
            brand_name=brand.name_en,
            table_label=order.table_label,
            zone_name=zone.name_en if zone else None,
            items=message_lines,
            total=float(total),
        )
        sent = await send_telegram_message(brand.telegram_bot_token, brand.telegram_chat_id, text)
        order.telegram_notified = "sent" if sent else "failed"
        db.commit()
        db.refresh(order)

    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.zone), joinedload(Order.placed_by))
        .filter(Order.id == order.id)
        .first()
    )
    return _to_out(order)


@router.get("/api/brands/{brand_id}/orders", response_model=list[OrderOut])
def list_orders(brand_id: uuid.UUID, scope: dict = Depends(get_current_user_scope), db: Session = Depends(get_db)):
    """Admin view (Level 1/2/3) — staff never see other orders, only place their own."""
    assert_can_manage_brand_content(db, scope["user"], brand_id)
    orders = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.zone), joinedload(Order.placed_by))
        .filter(Order.brand_id == brand_id)
        .order_by(Order.created_at.desc())
        .limit(100)
        .all()
    )
    return [_to_out(o) for o in orders]
