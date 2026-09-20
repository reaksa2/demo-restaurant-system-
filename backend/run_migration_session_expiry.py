"""
One-off migration: adds expires_at to user_sessions.

Without this column, a session row for a device that closed its browser
without logging out (its JWT quietly expires client-side) never gets
cleaned up — it sits in the table forever, permanently occupying one of
that user's max_devices slots, and is only ever removed if a cap eviction
happens to push it out later. This backfills expires_at for any rows that
already exist (as created_at + the token lifetime, so already-stale
sessions are immediately eligible for cleanup) and makes the column
required going forward.

HOW TO RUN (same pattern as the earlier multi-device/zone-tabs migration):
1. Fill in DATABASE_URL below with your real Neon connection string
   (Neon dashboard -> your project -> Connection Details -> the string
   starting with postgresql://...).
2. From the backend/ folder, with your venv active:
       python run_migration_session_expiry.py
3. Delete this file afterwards — it will contain your DB password.

Effect: any devices currently logged in get treated as still valid for
whatever's left of their original session lifetime (usually up to 8 hours),
same as before. Anything older than that is swept on the very next login
or request from that account.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://menu_user:menu_password@localhost:5432/restaurant_menu"  # <-- replace for production

# Must match ACCESS_TOKEN_EXPIRE_MINUTES in app/core/config.py (default 480).
TOKEN_LIFETIME_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP"))
    conn.execute(
        text(
            "UPDATE user_sessions SET expires_at = created_at + (:minutes * INTERVAL '1 minute') "
            "WHERE expires_at IS NULL"
        ),
        {"minutes": TOKEN_LIFETIME_MINUTES},
    )
    conn.execute(text("ALTER TABLE user_sessions ALTER COLUMN expires_at SET NOT NULL"))

print("Migration complete: user_sessions.expires_at added and backfilled.")
