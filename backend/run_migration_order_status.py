"""
Run this once against your production Neon database to apply all pending
migrations for: order status tracking.

1. Fill in your DATABASE_URL below (the Neon connection string from Render's
   environment variables).
2. Run: python run_migration.py
3. Delete this file afterward — it contains your database password.
"""
import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_BRVFPeLnEi15@ep-ancient-fire-a51owl3t-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cur = conn.cursor()

statements = [
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();",
]

for i, sql in enumerate(statements, 1):
    cur.execute(sql)
    print(f"Success: statement {i}/{len(statements)} ran (or already existed).")

print("All migrations applied successfully.")

cur.close()
conn.close()
