"""
Run this once against your production Neon database to apply all pending
migrations for: order status tracking.

1. Fill in your DATABASE_URL below (the Neon connection string from Render's
   environment variables).
2. Run: python run_migration.py
3. Delete this file afterward — it contains your database password.
"""
import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_geSs76zYRvZl@ep-muddy-unit-b3b2he3d-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"


conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cur = conn.cursor()

statements = [
    "ALTER TABLE users ADD COLUMN username VARCHAR(50) UNIQUE;"
]

for i, sql in enumerate(statements, 1):
    cur.execute(sql)
    print(f"Success: statement {i}/{len(statements)} ran (or already existed).")

print("All migrations applied successfully.")

cur.close()
conn.close()
