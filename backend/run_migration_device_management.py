"""
One-off migration: adds never_expire (users) and device-identification
columns (user_sessions), and allows user_sessions.expires_at to be NULL.

What this enables:
  - Per-user "never expire" login sessions (User.never_expire) — that
    account's devices stay signed in until an admin revokes them, instead
    of timing out after ACCESS_TOKEN_EXPIRE_MINUTES.
  - An admin can see which devices are logged into an account (browser/OS
    from the user agent, IP address, when it first logged in, when it was
    last active) and revoke any one of them, or all of them at once.

HOW TO RUN (same pattern as the earlier migrations):
1. Fill in DATABASE_URL below with your real Neon connection string.
2. From the backend/ folder, with your venv active:
       python run_migration_device_management.py
3. Delete this file afterwards — it will contain your DB password.

This migration is purely additive (new nullable columns, one relaxed NOT
NULL constraint) — no existing data is touched or at risk.
"""

from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://menu_user:menu_password@localhost:5432/restaurant_menu"  # <-- replace for production

engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS never_expire BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("ALTER TABLE user_sessions ALTER COLUMN expires_at DROP NOT NULL"))
    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500)"))
    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64)"))
    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP"))

print("Migration complete: never_expire added to users; user_agent, ip_address, last_seen_at added to user_sessions; expires_at is now nullable.")
