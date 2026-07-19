# Data Source Consistency Audit — Offline-First Compliance

Date: 2026-06-23
Scope: Orders, Reports, Customers, Inventory, Menu, Credit Ledger

## TL;DR

The app is **partially** offline-first. Six modules use four *different* hydration paths. That is exactly why Menu can render while Reports show zero, and vice-versa. There is no single "data router" that says: read IDB first, fall back to cloud, never the other way around.

The two worst offenders:

1. **Advanced Reports** (`/advanced-reports`) — **cloud-only via `supabase.rpc()`**. No IDB read, no fallback. If RPC fails or store_id is empty, the page is blank. This is the primary cause of the "Reports = 0 on a different browser" symptom even when orders exist locally.
2. **Menu / Orders hydration paths diverge.** Menu reads `supabase.from('menu_items')` *directly* with RLS, while Orders are pulled through the `sync-orders` edge function with store-auth validation. Different auth surface → one can succeed while the other fails on the same login.

---

## Per-module matrix

| Module | Primary source (read) | Fallback | Write path | Offline read? | Cross-browser read? |
|---|---|---|---|---|---|
| **Orders** | React state ← IDB (`getOrders`) ← `sync-orders` edge fn (fetch) | none (state is the only display source) | mirrorToIDB → enqueueMany → `sync-orders` (save) | ✅ yes | ⚠ only if `sync-orders` fetch succeeds at login (requires resolved `store_id` + store auth) |
| **Reports** (`/reports`) | React state `usePOS().orders` (same as above) | — | n/a (derived) | ✅ yes | ⚠ inherits Orders' fragility |
| **Advanced Reports** (`/advanced-reports`) | `supabase.rpc('get_*_report', { storeId })` | **none** | n/a (read-only RPC) | ❌ **no** | ❌ blank if RPC errors or storeId missing |
| **Menu** | React state ← IDB ← `supabase.from('menu_items').select()` (direct table read, RLS-gated) | retries via `useStoreDataSync` | local IDB write → `sync-store-data` (data_type=`menu_items`) → fallback enqueue | ✅ yes | ✅ yes (RLS on `menu_items` permits) |
| **Customers** (`pos_customers`) | React state ← IDB (`getCustomers`) ← syncEngine merge | `sync-store-data` (fetch) | local push + `sync-store-data` save, **falls back to** `queueFailedSync` | ✅ yes | ⚠ requires merchant-scope RLS on `pos_customers` |
| **Inventory** | React state ← IDB ← `sync-store-data` (fetch) | localStorage legacy keys | `sync-store-data` save + queueFailedSync | ✅ yes | ⚠ same |
| **Credit Ledger** | React state ← IDB via syncEngine; rendered from `getCredit*()` | `sync-store-data` (data_type=`credit_ledger`, `credit_payments`) | save call + queueFailedSync; **no** mirrorToIDB on the bill-create path → entry only exists after the credit save call lands | ⚠ partial | ❌ today (the credit save short-circuits when `customer_id` is missing — see `useStoreDataSync.ts:646`) |

---

## Why Menu can be present while Reports are zero (and vice-versa)

Four root causes, all observable in the current code:

1. **Different read endpoints.**
   - Menu hydration: `supabase.from('menu_items').select(...).eq('store_id', ...)` — direct PostgREST, only needs RLS to pass. `menu_items` RLS is permissive for the store members, so it returns rows.
   - Orders hydration: `supabase.functions.invoke('sync-orders', { action: 'fetch', store_id, store_code })` — edge function runs `authenticateRequest` against `store_code` / active store. If `currentStoreScope()` returned empty (the bug just fixed) or `store_code` is not in localStorage on this browser, fetch returns `[]`.
   - Result on a fresh browser: Menu paints (RLS works), Orders/Reports do not (edge auth fails).

2. **Advanced Reports is pure cloud.** `useAdvancedReports` → `supabase.rpc(...)`. No IDB fallback at all. Any RPC error or null `storeId` shows "0". This is independent of whether orders are actually in IDB or in Postgres.

3. **No "pull on login" guarantee.** Orders pull from `sync-orders` only fires inside `useStoreInitializer` after the store is resolved. If the user lands on Reports before that completes (or it failed silently), the page renders an empty state from empty IDB.

4. **Credit Ledger writes are conditionally skipped.** `useStoreDataSync.ts` line ~646: `if (!entries with customer_id) return;`. A credit bill created without a `pos_customers` row never enqueues, so no `credit_ledger` row is ever written server-side. This matches the observation "Credit Bill created, Credit Ledger entry not created".

---

## Modules NOT following the offline-first contract

| Module | Violation |
|---|---|
| **Advanced Reports** | Cloud-only RPC, no IDB cache, no queue. Must be rewritten to read from IDB-aggregated orders and only fall back to RPC when online. |
| **Credit Ledger save** | Silent early-return when `customer_id` is missing. Must always mirrorToIDB + enqueue, even when customer is unresolved. |
| **Orders fetch on login** | Treats `sync-orders` `[]` response as "nothing exists" instead of "cloud unreachable" — overwrites/leaves IDB empty on a new device. Should be merge-only: never replace local IDB with an empty server response. |
| **Menu vs Orders** | Two different read endpoints with two different auth surfaces. Should be unified behind a single "pull-on-login" routine that uses the same store auth for both. |

---

## Recommended fixes (in order)

1. **Unify hydration in one `hydrateFromCloud(storeId)` routine** called from `useStoreInitializer`. It must:
   - call `sync-orders` AND `sync-store-data` with the same `{store_id, store_code}` envelope,
   - merge into IDB (never wipe IDB on empty cloud response),
   - log per-table row counts pulled.
2. **Advanced Reports: add IDB aggregation fallback.** If `supabase.rpc` errors or storeId is null, compute the report client-side from `getOrders()` for the requested date range. Only show "0" when both sources agree.
3. **Credit Ledger write path:** remove the `customer_id` early-return; always `mirrorToIDB('credit_ledger', row)` + `enqueueMany`. Server-side, allow `customer_id NULL` with a deferred link.
4. **Read-only display contract:** every page component must read from React state hydrated from IDB. No page may call `supabase.from(...)` directly for display. (Menu currently violates this.)
5. **Queue completion semantics:** confirm `syncQueue.ts` only marks items `completed` after a 2xx server ack (it does today — keep that invariant when adding new tables).

---

## Data answers to the original questions

- **"Can each module display local data while cloud is unavailable?"**
  Orders ✅, Reports ✅ (derived from Orders), Menu ✅, Customers ✅, Inventory ✅, Credit Ledger ⚠ (only if mirrorToIDB ran — today it often doesn't), **Advanced Reports ❌**.

- **"Can each module display cloud data after login on a different browser?"**
  Menu ✅ (RLS read). Orders/Reports/Customers/Inventory/Credit Ledger ⚠ — all depend on the `sync-*` edge functions succeeding at login with a fully resolved store scope. Advanced Reports ❌ unless storeId is resolved synchronously before the page mounts.
