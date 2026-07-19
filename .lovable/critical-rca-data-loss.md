# CRITICAL RCA — Cloud Persistence Failure (data disappears after logout/login)

Status: **PRODUCTION BLOCKER. STOP RELEASE.**
Date: 2026-06-23
Scope: Orders, POS Customers, Credit Ledger, Credit Payments

---

## 1. TL;DR — Root Cause

The Phase 2.6 schema migration created `public.orders` (and several sibling tables) in a **normalized** shape that does **not** match the **denormalized** shape the application has always sent. Every write fails server-side with `column "store_id" does not exist` (and similar). The edge function masks the failure by returning HTTP 200 with `success:false`, so the client believes the sync succeeded.

Result:
- Data is written only to IndexedDB.
- On logout, IndexedDB is cleared (or scoped to the prior session) and there is nothing in the cloud to repopulate from.
- Reports, Orders, Customers, Credit Ledger and Credit Payments come back empty.

This is **not** a credit-flow bug. It is a schema/contract bug affecting every cloud-persisted table whose shape was changed by Phase 2.6.

---

## 2. Evidence — Database state (store `e179bee7-…742d`, the only active store)

| Table             | Total rows | Rows for active store |
|-------------------|-----------:|----------------------:|
| orders            | **0**      | n/a (no `store_id` column) |
| pos_customers     | **0**      | 0 |
| credit_ledger     | **0**      | 0 |
| credit_payments   | **0**      | 0 |
| menu_items        | 4          | 4 ✅ |
| products          | 12         | n/a (no `store_id` column) |
| categories        | 5          | n/a (no `store_id` column) |

Only `menu_items` is persisting — because its schema happens to match the client payload.

---

## 3. Evidence — Postgres error log (last 6h)

```
ERROR: column "store_id" does not exist
ERROR: column "store_code" does not exist
```

These come directly from the `sync-orders` edge function attempting `from('orders').upsert([... store_id, bill_number, items, customer_name, ...])`.

---

## 4. Evidence — Actual `public.orders` schema vs. what the client sends

**Actual columns** (`information_schema.columns`):

```
id, order_number, customer_id (FK uuid), cashier_id, status, subtotal,
tax_total, discount, total, paid_amount, change_amount, notes, created_at,
updated_at, order_type, table_id (FK uuid), cash_session_id, metadata
```

**Columns the client / edge function write** (`supabase/functions/sync-orders/index.ts` L194–224 and `src/hooks/useOrderSync.ts` L134–164):

```
id, store_id, bill_number, items (jsonb[]), subtotal, tax, discount, total,
order_type, table_number (text), customer_name, customer_phone,
payment_method, payment_details, status, cancel_reason, cancelled_at,
created_at, updated_at
```

Mismatch summary:

| Client field        | DB column       | Verdict |
|---------------------|-----------------|---------|
| `store_id`          | **missing**     | ❌ blocks every write |
| `bill_number`       | `order_number`  | ❌ renamed |
| `items` (jsonb)     | **missing** (rows live in `order_items` table) | ❌ |
| `tax`               | `tax_total`     | ❌ renamed |
| `customer_name/phone` | **missing** (FK `customer_id` only) | ❌ |
| `payment_method`    | **missing** (rows live in `payments` table) | ❌ |
| `payment_details` / `payment_breakdown` | **missing** | ❌ |
| `table_number` (text) | `table_id` (uuid FK) | ❌ type/shape |
| `cancel_reason` / `cancelled_at` | **missing** | ❌ |

`public.products` and `public.categories` also have **no `store_id`**, so they cannot be store-scoped either.

---

## 5. Why the failure is silent (so the client thinks it worked)

`supabase/functions/sync-orders/index.ts`:
- L156–163 (`action: 'fetch'`) — on any DB error returns `200 { success:true, orders:[] }`.
- L234–253 (`action: 'save'`) — on any DB error returns `200 { success:false, fallback:true, … }`.

`src/hooks/useOrderSync.ts` L206–212 only logs `console.error`; the queue is not marked failed and the user sees no toast. Same pattern in `src/hooks/useCloudMutations.ts` and `src/hooks/useStoreDataSync.ts` (`callSyncFunction` swallows 2xx-with-error).

Net effect: writes fail forever; the UI keeps showing local IndexedDB data; on logout that local cache is gone and there is nothing to pull back.

---

## 6. Sync trace — one credit bill, end-to-end

| Step | Where | Outcome |
|------|-------|---------|
| 1. Bill creation | `POSContext.directBillPrint` | ✅ writes Order + CreditEntry to IndexedDB |
| 2. Queue enqueue | `syncQueue.enqueue` | ✅ items appear in `sync_queue` |
| 3. Direct upsert path | `useOrderSync.saveOrdersToCloud` L166–169 (`supabase.from('orders').upsert(...)`) | ❌ Postgres: `column "store_id" does not exist` → falls through |
| 4. Edge fallback | `supabase.functions.invoke('sync-orders', {action:'save'})` | ❌ same error, function returns 200 `{success:false}` |
| 5. Customer save | `useStoreDataSync.savePosCustomerToCloud` → `sync-store-data` upserting `pos_customers` | likely failing for the same family of reasons (0 rows in DB) |
| 6. Ledger save | `useStoreDataSync.saveCreditEntryToCloud` → `sync-store-data` upserting `credit_ledger` | requires `customer_id`; since step 5 never persisted a customer, `customer_id` is unresolved → row dropped |
| 7. Realtime | `syncEngine` channels on `orders/pos_customers/credit_ledger` filtered by `store_id` | ❌ no inserts ever happen on the server, so no events fire |
| 8. Pull cycle | `sync-orders` fetch returns `[]`; `pullCreditLedger` returns `[]` | ❌ nothing to merge |
| 9. UI | Reports/Credit Ledger render whatever is still in IndexedDB | ✅ until logout, then ❌ |

**Chain breaks at step 3** (server schema). Every downstream stage is a consequence.

---

## 7. Store / identity validation

All client paths consistently resolve and send the same `store_id` (`e179bee7-…742d`) and `store_code` from `localStorage` keys `owner_selected_store_id`, `pos_active_store_data`, `pos_store_code` (see `src/hooks/useCloudData.ts` L6–41 and `src/hooks/useStoreDataSync.ts` L23–73). Identity is **not** the failing layer — the failing layer is the table schema.

---

## 8. Files / functions that must change

Server (database):
- `public.orders` — add `store_id uuid not null`, `bill_number text`, `items jsonb`, `tax numeric`, `customer_name text`, `customer_phone text`, `payment_method text`, `payment_details jsonb`, `payment_breakdown jsonb`, `table_number text`, `cancel_reason text`, `cancelled_at timestamptz`. Add index + RLS + GRANTs scoped via `can_manage_store(store_id)`. Add to `supabase_realtime` publication.
- `public.products`, `public.categories` — add `store_id uuid not null` + RLS + GRANT + realtime, **only if** these tables are actually used by the POS surface (need confirmation; the POS currently reads `menu_items`).

Edge function:
- `supabase/functions/sync-orders/index.ts` L156–163 and L234–253 — stop returning `200 {success:false}`. Return `4xx/5xx` with explicit `code/hint` so the client queue can mark items failed and surface the problem.

Client:
- `src/hooks/useOrderSync.ts` L206–212 — treat `data.success === false` as a hard failure and re-queue.
- `src/hooks/useStoreDataSync.ts` `callSyncFunction` (L90+) — same.
- `src/hooks/useCloudMutations.ts` — already hardened today; keep.

No frontend rename is required if the DB is widened to the denormalized shape, which is the lowest-risk path.

---

## 9. Recommended fix order (awaiting approval — no code touched yet)

1. **Migration A — widen `public.orders`** to the denormalized contract above (additive only; preserves existing normalized columns).
2. **Migration B — add `store_id` to `products` / `categories`** *iff* the POS actually reads them.
3. **Edge function** — flip silent 200s to real failures.
4. **Client** — propagate failures into queue/poison + UI toast.
5. Re-run Production Validation Phases C–F.

---

## 10. Success criteria before any further release work

- Creating an Order writes a row in `public.orders` with the correct `store_id`.
- Creating a credit bill writes rows in `public.pos_customers` and `public.credit_ledger`.
- Logout → login on the same device returns the same counts.
- Cross-device sync round-trips within the realtime channel.
- Zero rows in `sync_queue_poisoned` after a clean run.

Until Migration A lands, **no further validation can pass** because the server cannot accept order writes at all.
