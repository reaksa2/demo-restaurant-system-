# Upgrade guide — roles, expenses, inventory, purchasing, reports

This release adds, on top of the billing version:

| Area | What it does | Who sees it |
|---|---|---|
| **Roles** | New `sales` and `accountant` accounts, one brand each | — |
| **Sales desk** | Live orders + checkout/payment for one brand | Sales |
| **Expenses** | Record money out by category; filter, totals, CSV | Accountant, managers |
| **Inventory** | Stock items, stock in/out/waste/count, low-stock alerts, recipes that deduct stock when food is sold | Managers (edit), Accountant (read-only) |
| **Purchasing** | Suppliers, purchase orders (draft → ordered → received), supplier payments, amount owed | Managers (create/receive), Accountant (view + pay) |
| **Reports** | Profit & Loss, best sellers, busy hours, bills & revenue trend; all-brands or one brand; Excel (CSV) + Print/PDF | Accountant, managers |

Who can do what lives in ONE file: `backend/app/core/modules.py`.
The sidebar is built from the permission list the API sends, so it can never disagree with the server.

## 1. Before you start
* Take a database backup (Neon: create a branch / snapshot).
* Test on staging first. Never commit a real connection string.

## 2. Database migrations (run in this order, once each, against PRODUCTION)
Both scripts are additive — they never change or delete existing rows — and are safe to re-run.

```
cd backend
# 1) new roles
#    edit DATABASE_URL at the top of the file to your real connection string
python run_migration_roles.py
# 2) new tables (expenses, stock, recipes, suppliers, purchase orders)
python run_migration_operations.py
```
Then **delete / do not commit** the edited scripts (they would contain your DB password).
Run them BEFORE deploying the new backend, otherwise creating a sales/accountant user fails.

## 3. Deploy
1. Merge the branch (e.g. `feature/billing` → `main`).
2. Deploy the backend (Render), wait for `/api/health`.
3. Deploy the frontend. Staff tablets just reload; nothing changes for them.

## 4. Smoke test (10 minutes)
1. Log in as the owner: sidebar shows Expenses / Inventory / Purchasing / Reports.
2. Users → New user → role **Accountant** for a brand → log in as them: sidebar = Expenses, Inventory, Purchasing, Reports only; `/admin/users` bounces back.
3. New user → role **Sales** → log in: sidebar = Sales only; can bill + take payment, cannot open menu/users.
4. Inventory → New item (e.g. Rice, kg) → Recipes → give a food a recipe → place an order, bill it, pay → the item's stock drops (History shows a "Sold" line).
5. Purchasing → New purchase order → Mark ordered → Mark received (stock rises) → Pay supplier → an expense appears under Expenses ("Supplier payment").
6. Reports → Profit & Loss shows revenue, expenses, net.

## 5. Setting up a brand's back office (suggested order)
Suppliers → Stock items (with opening balance + cost) → Recipes for the foods you want tracked → start using Purchasing/Expenses.
Foods without a recipe are simply not tracked, so you can roll this out food by food.

## 6. Behaviour worth knowing
* **Stock is deducted when a bill is paid** (or, for brands with billing off, when an order is marked completed). An order is deducted at most once, even if re-opened/re-completed. Cancelled orders never deduct. Stock may go slightly negative if sales outrun counts — do a "Stock count" to correct it.
* **Profit & Loss is cash-basis**: revenue = bills paid in the period; expenses = expense date in the period. A supplier purchase counts when you PAY it (that payment is auto-recorded as an expense), not when you order/receive it. "Owed to suppliers" and "Stock value" are as-of-now figures.
* **Average cost**: stock in with a cost updates a weighted-average cost per item; used for the stock-value figure.
* **Default permissions** (change in `modules.py`): Sales cannot void bills; Accountant can void an *unpaid* bill but cannot take orders/payments; Accountant cannot edit stock or create purchase orders but can pay suppliers.
* All data is per brand. A manager of several brands switches brands with the picker, or chooses "All brands" in Reports.

## 7. Rollback
Code: redeploy the previous version — the old code ignores the new tables/enum values.
Data: the new tables can stay (unused). Do not remove the new enum values; Postgres cannot drop them safely.
