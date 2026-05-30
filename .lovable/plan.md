# Purchasing & Receiving App — Plan

Internal tool replacing a slice of Cin7 Core for a construction supplies business. Desktop-first, sidebar nav, simple operational UI, Supabase Auth (authenticated internal users only).

## Stack
- TanStack Start + React, Tailwind, shadcn/ui (sidebar, table, dialog, form)
- Lovable Cloud (Supabase) for DB + Auth
- All data access via `createServerFn` with `requireSupabaseAuth`; RLS: any authenticated user can read/write (internal app)

## Data Model

```text
suppliers
  id, name, code, contact_name, email, phone, address,
  payment_terms, currency, notes, is_active, created_at

products
  id, sku, name, description, unit (ea/m/kg/etc), category, is_active

supplier_prices
  id, supplier_id → suppliers, product_id → products,
  supplier_sku, unit_price, currency, min_qty, lead_time_days,
  valid_from, valid_to, is_preferred

purchase_orders
  id, po_number (auto), supplier_id, status
    (draft | sent | partially_received | received | closed | cancelled),
  order_date, expected_date, currency, subtotal, tax, total,
  notes, created_by, created_at

purchase_order_lines
  id, po_id, product_id, description, qty_ordered, qty_received,
  unit_price, line_total

receipts
  id, po_id, receipt_number, received_date, received_by, notes, created_at

receipt_lines
  id, receipt_id, po_line_id, qty_received

po_payments
  id, po_id, payment_date, amount, method
    (bank_transfer | card | cheque | cash | other),
  reference, notes, created_by, created_at
```

Derived per PO: `amount_paid = sum(po_payments)`, `balance_due = total - amount_paid`, `payment_status` (unpaid / partial / paid).

## Pages

1. **Dashboard** — KPI cards (open POs, POs awaiting receipt, outstanding payables, received this month), recent POs, recent receipts.
2. **Suppliers** — searchable table; create/edit dialog.
3. **Supplier Detail** — header + tabs: Info, Price List, Purchase Orders, Payments.
4. **Products / Supplier Prices** — product list; per-product side panel showing all supplier prices; add/edit price rows; mark preferred supplier.
5. **Purchase Orders** — filterable list (status, supplier, date); "New PO" button.
6. **Purchase Order Detail** — header (supplier, dates, status), line items editor (add product → autofill price from supplier_prices), totals, actions: Save Draft / Send / Cancel / Receive / Record Payment. Sub-sections list receipts and payments against this PO.
7. **Receiving** — two modes: list of POs awaiting receipt, and receive-against-PO form (qty_received per line, partial OK; updates PO status automatically).
8. **Payments** — list of all payments with filters; record payment form (select PO, amount, method, reference).

## Layout & Navigation
- `SidebarProvider` shell in `__root.tsx` with header containing `SidebarTrigger` + user menu (sign out).
- Sidebar items: Dashboard, Suppliers, Products, Purchase Orders, Receiving, Payments.
- Routes under `_authenticated/` layout; `/login` public.
- Active route highlighting via `useRouterState`.

## Auth
- Email/password via Supabase Auth (`/login`, `/signup` optional or admin-only).
- `_authenticated` layout: synchronous `context.auth` check + child `beforeLoad` calls `supabase.auth.getUser()` to hydrate session before loaders.
- Root `onAuthStateChange` listener invalidates router + query cache.

## Server Functions (examples)
- `listSuppliers`, `getSupplier`, `upsertSupplier`
- `listProducts`, `upsertProduct`, `listSupplierPrices`, `upsertSupplierPrice`
- `listPurchaseOrders`, `getPurchaseOrder`, `createPurchaseOrder`, `updatePOLines`, `setPOStatus`
- `createReceipt` (transactional: insert receipt + lines, increment `qty_received`, recompute PO status)
- `listPayments`, `recordPayment`
All use `requireSupabaseAuth` and TanStack Query (`queryOptions` + `ensureQueryData` + `useSuspenseQuery`).

## RLS
Single policy per table: `auth.uid() IS NOT NULL` for SELECT/INSERT/UPDATE/DELETE to `authenticated`. GRANTs added per template rules.

## Design
Neutral, operational: white background, slate text, single blue accent for primary actions, status badges (gray/blue/amber/green/red). Inter for body, slightly tighter table density. No marketing flourishes.

## Build Order
1. Enable Lovable Cloud, create schema + RLS + GRANTs
2. Auth (login page, `_authenticated` layout, sidebar shell)
3. Suppliers (list, detail, CRUD)
4. Products + Supplier Prices
5. Purchase Orders (list, detail, line editor, status transitions)
6. Receiving (list awaiting, receive form, PO status updates)
7. Payments (list, record)
8. Dashboard KPIs
