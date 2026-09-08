import httpx


async def send_telegram_message(bot_token: str, chat_id: str, text: str) -> bool:
    """
    Best-effort send. Returns True/False for whether it succeeded — never
    raises, so a misconfigured or unreachable Telegram bot can never break
    order creation itself.
    """
    if not bot_token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
            return response.status_code == 200
    except Exception:
        return False


def format_order_message(brand_name: str, table_label: str | None, zone_name: str | None, items: list, total: float) -> str:
    lines = [f"🍽️ <b>New order — {brand_name}</b>"]
    if table_label:
        lines.append(f"Table: {table_label}")
    if zone_name:
        lines.append(f"Zone: {zone_name}")
    lines.append("")
    for item in items:
        lines.append(f"• {item['quantity']}x {item['name_en']} — ${item['unit_price']:.2f} each")
    lines.append("")
    lines.append(f"<b>Total: ${total:.2f}</b>")
    return "\n".join(lines)
