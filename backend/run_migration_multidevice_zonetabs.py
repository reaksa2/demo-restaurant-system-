"""
One-time migration for two features:
  1. Configurable multi-device login (max_devices column + user_sessions table,
     replacing the old single active_session_id column).
  2. Multi-zone staff tabs (no schema change needed — user_brands.zone_id was
     already nullable; this migration just leaves existing staff's zone
     assignments untouched, so nothing changes for them until an admin
     explicitly switches one to "All zones" in the Users page).

DISPOSABLE: fill in your real DATABASE_URL below, run this once against your
production database, then delete this file (it contains your DB password).

Run:  python run_migration_multidevice_zonetabs.py
"""
import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_geSs76zYRvZl@ep-muddy-unit-b3b2he3d-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"  # <-- replace with your real Render/Neon connection string

STATEMENTS = [
    """
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;
    """,
    """
    CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id ON user_sessions(user_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_user_sessions_session_id ON user_sessions(session_id);
    """,
    """
    ALTER TABLE users
    DROP COLUMN IF EXISTS active_session_id;
    """,
]


def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            for i, stmt in enumerate(STATEMENTS, start=1):
                print(f"Running statement {i}/{len(STATEMENTS)}...")
                cur.execute(stmt)
        conn.commit()
        print("Success: all statements ran and were committed.")
        print("Everyone currently logged in will need to log in again once "
              "this backend redeploys (their old sessions no longer exist).")
    except Exception:
        conn.rollback()
        print("Something went wrong — rolled back, no changes were made.")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
