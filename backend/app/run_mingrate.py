import psycopg2

DATABASE_URL = "your Render Postgres External URL here"

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cur = conn.cursor()

cur.execute("ALTER TABLE users ADD COLUMN active_session_id VARCHAR(64);")

print("Success: active_session_id column added.")

cur.close()
conn.close()