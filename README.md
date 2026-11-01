# Restaurant Multi-Brand Menu System (V1)

All 11 development phases from the spec, built and **verified against a real,
running stack** — a live PostgreSQL database, a live FastAPI server, and a
real browser (Playwright/Chromium) clicking through the actual React UI —
not just import-checked or eyeballed.

## What's implemented

- **Database (SQLAlchemy models):** `users`, `groups`, `brands`, `zones`,
  `categories`, `foods`, `food_prices`, `user_groups`, `user_brands` — see
  `app/db/models/`.
- **Auth:** JWT login (`POST /api/auth/login`), `GET /api/auth/me`.
- **Authorization:** centralized in `app/core/permissions.py`. Every
  endpoint enforces Level1 → all / Level2 → their group's brands / Level3 →
  their one brand / Staff → their one brand+zone, **on the backend**, per
  spec section 9.
- **APIs:** groups, brands, zones, categories, foods (admin view with all
  zone prices), prices (per-zone upsert), users (scoped creation matching
  the role hierarchy), clone food list, staff/public menu (resolves to
  exactly one price per food, server-side), image upload.
- **Zone-based pricing security:** the menu endpoint (`GET /api/menu`) never
  returns another zone's price — verified by asserting the *other* zone's
  price string never appears anywhere in the raw JSON response.
- **Clone food list:** creates fully independent `Food`/`FoodPrice` rows;
  matches categories and zones between brands by English name; reports
  clearly (not silently) when a target brand has no matching zone for a
  price.

## Decisions made to fill spec gaps (flagged earlier, resolved here)

1. **Zones are scoped per-brand** (`zones.brand_id`), since different brands
   may have different zone names/counts.
2. **Unavailable foods are shown, not hidden**, on the menu endpoint (the
   food's `is_available: false` flag is included; the frontend decides how
   to render it) — matches the first example in spec section 13.
3. **Discounts:** `food_prices` has `regular_price`, `discount_price`
   (nullable), `discount_active` (bool). The effective price is whichever
   applies — a simple on/off toggle rather than date-based scheduling, which
   the spec didn't define.
4. **A user has either a group assignment (Level2) or a brand assignment
   (Level3/Staff), never both** — enforced in the API layer.
5. **First Level1 account** is created by `seed.py` from `.env` values —
   there's no open signup route for Level1.

## Setup

```bash
cd backend
python3 -m venv venv && source venv/bin/activate    # optional but recommended
pip install -r requirements.txt

cp .env.example .env
# edit .env: set DATABASE_URL to your Postgres instance,
# a real SECRET_KEY, and the first Level1 login you want.

# Create the database itself first, e.g.:
#   createdb restaurant_menu
# or via psql:
#   CREATE DATABASE restaurant_menu OWNER your_user;

python3 seed.py        # creates all tables + the first Level1 user
uvicorn app.main:app --reload --port 8000
```

Then open **http://localhost:8000/docs** for interactive Swagger docs of
every endpoint, or log in via `POST /api/auth/login` with the email/password
from your `.env`.

## Verifying it yourself

`e2e_test.py` is the exact test script used to validate this build. It spins
through the full spec section-9 scenario (Group A/B, Brand A/B/D, Level2/3
users, Staff A=Inside/Staff B=Outside, zone pricing, clone) against a running
server and asserts every permission boundary and pricing rule. To re-run it:

```bash
# terminal 1
uvicorn app.main:app --port 8000

# terminal 2 (fresh DB recommended first, since it creates real data)
pip install requests
python3 e2e_test.py
```

It should print 47/47 `[PASS]` lines ending in `ALL CHECKS PASSED`.

## Frontend (Phases 5–7)

`frontend/` is a React + Vite + Tailwind app with two halves:

- **Admin panel** (`/admin/...`) — used by Level1/2/3. Dashboard, Groups
  (Level1), Brands (list + create + detail), a tabbed brand detail view
  (Info / Zones / Categories / Foods), a food editor with per-zone pricing
  and image upload, Users (creation options change based on who's logged
  in — Level1 can create Level2/3/Staff, Level2 can create Level3/Staff,
  Level3 can only create Staff), and Clone Menu (Level2 only).
- **Staff display** (`/staff/menu`) — what spec section 6 describes: staff
  log in once, and the screen shows the food list with exactly one price
  per item, resolved from their assigned zone. This is the same screen a
  customer would be shown at the counter/table.

Design is deliberately split in tone: the admin panel is a plain,
utilitarian dark-sidebar dashboard (this is internal tooling, not a place
for visual flourish), while the staff/customer display uses a warmer,
food-forward look — a serif display face paired with a matching Khmer serif
for food names, Khmer set above English throughout, per spec section 11.

### Setup

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173, proxies /api and /static to :8000
```

Make sure the backend (see below) is running on port 8000 first — the Vite
dev server proxies API calls to it. For a production build: `npm run build`
outputs static files to `frontend/dist/`, deployable behind any static host
or reverse-proxied alongside the API.

### Verifying it yourself

`frontend/ui_smoke.mjs` is a Playwright script that seeds fresh data through
the real API, then drives an actual Chromium browser through the real app:
logs in as Level1, confirms the admin Foods view shows both zone prices,
then logs in as two different staff accounts (Inside/Outside) and asserts
each one's rendered page contains *only* their own zone's price and never
the other one's — the same guarantee verified on the backend, now confirmed
in the actual rendered UI.

```bash
# terminal 1
cd backend && uvicorn app.main:app --port 8000

# terminal 2
cd frontend && npm run dev

# terminal 3
cd frontend && npx playwright install --with-deps chromium   # first time only
node ui_smoke.mjs
```

It should print `ALL UI SMOKE CHECKS PASSED`. Screenshots of each step are
written to `/tmp/shot_*.png` if you want to see what it saw.

## Not built (out of scope per spec section 1)

- Alembic migrations (V1 uses `Base.metadata.create_all()`, fine for a fresh
  build; worth switching once the schema needs to evolve without dropping
  data)
- Everything explicitly excluded from V1: online ordering, cart, customer
  accounts, payment, kitchen ordering, delivery.

## A note on a bug caught during testing

`sqlalchemy`'s `joinedload(...).joinedload("zone")` (string form) raised a
runtime `ArgumentError` — needed to be `joinedload(...).joinedload(FoodPrice.zone)`
(class-bound attribute). This only showed up once actually hitting the
endpoint with a live request, not from `import`-checking the app — which is
why this build was validated with real HTTP calls against a real database
rather than static review alone.


## Roles & back-office modules
See `UPGRADE_GUIDE.md` for the full list of roles (Developer, Group Manager, Brand Manager, Sales, Accountant, Staff), what each can do, the new Expenses / Inventory / Purchasing / Reports modules, and how to upgrade a live database. Permissions are defined in `backend/app/core/modules.py`.
