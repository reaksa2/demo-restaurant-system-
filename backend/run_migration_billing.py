"""
One-off migration: adds the Billing/Invoice module.

What this enables:
  - Per-brand billing toggle (Brand.billing_enabled), same pattern as the
    existing Brand.ordering_enabled — off by default, so nothing changes
    for existing restaurants until a developer turns it on for them.
  - Brand.next_invoice_number: a simple per-brand counter for human-friendly
    invoice numbers (#0001, #0002, ...).
  - Order.billed: marks an order as already folded into a bill, so it can't
    be billed twice.
  - New tables: bills, bill_items, bill_orders.

HOW TO RUN (same pattern as the earlier migrations):
1. Fill in DATABASE_URL below with your real Neon connection string.
2. From the backend/ folder, with your venv active:
       python run_migration_billing.py
3. Delete this file afterwards — it will contain your DB password.

This migration is purely additive (new nullable-safe columns with defaults,
new tables) — no existing data is touched or at risk.
"""

from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://menu_user:menu_password@localhost:5432/restaurant_menu"  # <-- replace for production

engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE brands ADD COLUMN IF NOT EXISTS billing_enabled BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("ALTER TABLE brands ADD COLUMN IF NOT EXISTS next_invoice_number INTEGER NOT NULL DEFAULT 1"))
    conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS billed BOOLEAN NOT NULL DEFAULT false"))

    conn.execute(text("""
        DO $$ BEGIN
            CREATE TYPE billstatus AS ENUM ('unpaid', 'paid', 'void');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            CREATE TYPE paymentmethod AS ENUM ('cash', 'card', 'qr', 'other');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bills (
            id UUID PRIMARY KEY,
            brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
            zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
            created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            invoice_number INTEGER NOT NULL,
            table_label VARCHAR(100),
            subtotal NUMERIC(10, 2) NOT NULL,
            discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
            tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
            tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
            total_amount NUMERIC(10, 2) NOT NULL,
            status billstatus NOT NULL DEFAULT 'unpaid',
            payment_method paymentmethod,
            paid_at TIMESTAMP,
            notes VARCHAR(500),
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bill_items (
            id UUID PRIMARY KEY,
            bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
            food_name_en VARCHAR(255) NOT NULL,
            food_name_kh VARCHAR(255) NOT NULL,
            unit_price NUMERIC(10, 2) NOT NULL,
            quantity INTEGER NOT NULL
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS bill_orders (
            id UUID PRIMARY KEY,
            bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
            order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE
        )
    """))

    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bills_brand_id ON bills(brand_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bill_items_bill_id ON bill_items(bill_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bill_orders_bill_id ON bill_orders(bill_id)"))

print("Billing migration applied successfully.")
