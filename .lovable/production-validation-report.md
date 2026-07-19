# Production Validation Report — Phase A–G

Date: 2026-06-23
Validator: Lovable static + DB audit (interactive multi-device runs require human operators on real hardware; those scenarios are marked **PENDING-MANUAL** and the harness for them is the test plan at `.lovable/production-readiness-test-plan.md`).

What this report covers right now: end-to-end audit of the offline-first stack against the live database schema, the running edge functions, and the client sync engine. Findings that block the stated success criteria (zero data loss, zero cross-store leakage, zero queue corruption, zero sync corruption) are listed as **CRITICAL** and require fixes before manual validation runs.

---

## Executive Summary

| Success Criterion | Status |
|---|---|
| Zero data loss | ⚠️ At risk — see CRIT-1, CRIT-2 |
| Zero cross-store leakage | ❌ **Failing** — see CRIT-2, HIGH-1, HIGH-2 |
| Zero queue corruption | ⚠️ At risk — see CRIT-1 (guaranteed poison flood for any credit op) |
| Zero sync corruption | ❌ **Failing** — see CRIT-1 (every 30s pull throws on missing tables) |
| No critical production blockers | ❌ **2 critical, 2 high, 3 medium** found |

**Recommendation: halt rollout.** The 2 CRITICAL findings below are deterministic and reproducible from code + schema alone — they will fire on every device the moment the engine runs against production data. Manual Phase A–G runs should not begin until CRIT-1 and CRIT-2 are resolved, because they will mask or be confused with any other findings.

---

## CRITICAL Findings

### CRIT-1 — Sync engine references tables that do not exist in production

**Where:** `src/lib/syncEngine.ts` (pulls, realtime channel), `src/lib/syncQueue.ts` (queue), `src/lib/idb.ts` (mirror), `src/lib/store.ts` line 649 (mirrorToIDB).

**Evidence (DB):**
```
public schema contains: customers, expenses, menu_items, orders, products
public schema does NOT contain: credit_ledger, credit_payments
```

**Impact:**
1. `pullCreditLedger` and `pullCreditPayments` run every 30s and on every realtime event. Both throw "relation does not exist" or 404 from PostgREST. Errors are swallowed in the catch, but the pull cycle aborts before the lines that follow.
2. The realtime channel binds `postgres_changes` filters on `credit_ledger` and `credit_payments`. Subscription resolves as `CHANNEL_ERROR` on those bindings → realtime status flaps and may degrade the whole channel.
3. Any user action that writes to credit_ledger goes through `mirrorToIDB` → `enqueue`. The drain calls `supabase.from('credit_ledger').upsert(...)` which fails with a permanent error (SQLSTATE `42P01`, "relation does not exist") → `isPermanentError` returns true → item poisons after 3 attempts. **All credit-sale and credit-payment activity becomes silently undeliverable.**
4. The Phase 2.5 metadata trigger was not (and could not be) installed on these tables, so even if they existed in another schema the conflict protection would be absent.

**Severity rationale:** affects every device; deterministic; corrupts the queue (poison entries pile up indefinitely); breaks Phase C "Credit Workflows" and Phase D "Multi-Device" tests; produces console noise that will mask other bugs during manual validation.

**Required action (deferred per user directive — flagging only):** decide whether to (a) create the missing tables with metadata + RLS + GRANT, or (b) remove the references from the sync engine, queue table list, IDB schema, and realtime bindings. This is a critical blocker and the user's "no new architecture unless critical" clause applies.

---

### CRIT-2 — `customers` sync writes POS customer data into the merchant onboarding table

**Where:** `src/lib/syncEngine.ts` `buildPayload('customers', …)` (lines 77-89) and `pullCustomers` (lines 489-500).

**Evidence (DB):** `public.customers` schema includes `business_name, owner_name, owner_email, approval_status, subscription_plan, subscription_tier, subscription_start, subscription_end, max_stores, staff_limit, outlet_limit, gov_id_url, approved_by, rejected_at, suspended_by, owner_user_id, …`. This table is the **merchant/tenant onboarding registry**, not POS end-customers.

**Impact:**
1. Every POS-created "customer" (name, phone, address) is upserted into the merchant registry. If RLS allows the write, this pollutes the tenant table with rows that have no `business_name`, no `approval_status`, no `owner_user_id` — they will appear in any admin merchant list and may be mistaken for pending signups.
2. `pullCustomers` calls `supabase.from('customers').select('*')` with **no `store_id` filter and no scoping** (the table has no `store_id` column). If RLS lets it through, every device pulls every merchant in the platform. If RLS blocks it, the pull silently returns nothing and customer sync is dead.
3. The Phase 2.5 metadata trigger now fires on every merchant row update (super-admin onboarding flows, subscription renewals, suspensions). Any legacy admin tool that issues an UPDATE without sending `metadata.version_number ≥ stored` will get `SQLSTATE 40001` rejected. **This will break merchant onboarding once any client writes a versioned row.**
4. Realtime subscribes to `customers` without any filter (line 195) — every merchant table change is broadcast to every POS device on every store, every tenant.

**Severity rationale:** dual-direction cross-tenant leakage. Violates the "zero cross-store leakage" success criterion at the platform level, not just at the store level. Risk of corrupting the merchant registry. Risk of breaking unrelated super-admin flows via the metadata trigger.

**Required action (flagging):** introduce a dedicated POS-customer table (e.g. `pos_customers` with `store_id`, RLS, GRANT, metadata column) and rewire `buildPayload('customers')`, `pullCustomers`, and the realtime binding to it. Until then customer sync is unsafe.

---

## HIGH Findings

### HIGH-1 — Same-tab store switch does not rebind realtime

**Where:** `src/lib/syncEngine.ts` lines 162-171 + 204.

**Evidence:** the only rebind triggers are (a) the `storage` event listener and (b) `rebindRealtime()`. `storage` events do **not** fire in the tab that wrote the value, and `grep` shows no caller of `syncEngine.rebindRealtime` anywhere in the codebase. After a user switches stores in the same tab, the realtime channel keeps listening on the OLD `store_id` filter until full page reload.

**Impact:** Phase F "Store Switching → Realtime isolation" fails. Cross-store realtime events keep arriving for the previously selected store; new-store events are missed until reload.

### HIGH-2 — Realtime `customers` binding has no store filter (also part of CRIT-2)

**Where:** `src/lib/syncEngine.ts` line 195. Broadcasts every customer change to every device regardless of store/tenant. Even after CRIT-2 is fixed by moving to a `pos_customers` table, the new binding must be filtered on `store_id`.

---

## MEDIUM Findings

### MED-1 — `enqueue` dedup query is not store-scoped enough

`syncQueue.ts` line 57-60 keys dedup on `record_id + table + store_id + op`. If two stores happen to share a UUID (extremely unlikely, but possible for `menu_items` cloned across stores), the filter still correctly separates them. ✔ No action — verified safe; documented here so it isn't re-raised.

### MED-2 — Pull error swallowing hides hard failures

`pullOrders`, `pullCreditLedger`, `pullCreditPayments`, `pullCustomers`, `pullMenuItemsToIDB`, `pullProductsToIDB` all do `if (!data || error) return;` with no logging. Real schema/RLS errors are invisible. Recommend `console.warn` on `error`. Will become important during manual Phase A runs.

### MED-3 — `metaGet` re-imported twice in `sync()`

`syncEngine.ts` lines 414-417 dynamically import `./idb` twice in one function. Harmless but produces a redundant module promise and makes the throughput counter racy if `sync` is called concurrently (which it isn't, due to `isSyncing` guard). Cosmetic.

---

## Data Integrity Findings

- IDB envelope writes (`bulkPutRecords`) correctly compare via stableStringify before writing — verified in `idb.ts`. ✔
- `safeMerge` is invoked for orders/credit_ledger/customers/credit_payments — verified preserves local-only rows. ✔
- Phase 2.5 metadata trigger (`enforce_metadata_versioning`) is installed and rejects stale versions with SQLSTATE 40001. Verified via `db-functions`. ✔
- `ackFailure` correctly routes 40001 to `conflicts` table and drops the queue item — verified in `syncQueue.ts` line 171-189. ✔
- Queue persistence (Dexie, `idb.sync_queue`) survives reload by design — verified by schema in `idb.ts`. ✔ (Manual restart test PENDING.)

---

## Performance Findings (static review)

- Batch upsert chunks of 50 — verified `drainViaBatchUpsert`. ✔
- Realtime burst coalescing window 1s — verified. ✔
- IDB write-skipping via stableStringify diff — verified. ✔
- Pull caps: orders 200, menu_items 1000, products 2000 — adequate for small/medium stores; will need pagination for stores with > those record counts (NOTE — not a current blocker).

---

## Phase-by-Phase Status

| Phase | Scenarios | Static / DB Verdict | Manual Run |
|---|---|---|---|
| A. Core Billing | 8 | Order pipeline clean; **Credit Bills blocked by CRIT-1** | PENDING-MANUAL after CRIT-1 |
| B. Inventory | 5 | Pipeline via `sync-store-data` edge fn intact | PENDING-MANUAL |
| C. Customer | 4 | **Blocked by CRIT-2** | PENDING-MANUAL after CRIT-2 |
| D. Multi-Device | 4 | Conflict trigger live; **realtime customer leakage (HIGH-2)** | PENDING-MANUAL after HIGH-1/2 |
| E. Offline | 6 | Queue, persistence, drain logic verified; **credit ops will poison (CRIT-1)** | PENDING-MANUAL after CRIT-1 |
| F. Store Switching | 4 | **Same-tab realtime rebind broken (HIGH-1)** | PENDING-MANUAL after HIGH-1 |
| G. Stress | 5 | Batching + dedup in place | PENDING-MANUAL |

---

## Bug List Summary

| ID | Severity | Title |
|---|---|---|
| CRIT-1 | Critical | credit_ledger / credit_payments tables missing in DB; sync engine still pushes & pulls them |
| CRIT-2 | Critical | `customers` sync writes POS data into the merchant onboarding table; cross-tenant leakage |
| HIGH-1 | High | Same-tab store switch never rebinds the realtime channel |
| HIGH-2 | High | Realtime `customers` channel has no store filter (related to CRIT-2) |
| MED-2 | Medium | Pull errors silently swallowed — should log to console |
| MED-3 | Medium | Duplicate dynamic import in `sync()` |
| (MED-1) | (verified safe) | dedup scoping audit — no action needed |

---

## Conclusion

Static and database-level validation found **2 critical** and **2 high** production blockers. All four are deterministic from code + live schema and will reproduce on every device on first run — they do not require multi-device hardware to confirm.

Per the user's directive ("do not introduce architecture changes during this phase unless a critical production blocker is discovered"), CRIT-1, CRIT-2, HIGH-1, HIGH-2 each qualify as critical production blockers. Awaiting decision on whether to proceed with targeted fixes before kicking off the manual Phase A–G runs on real hardware.

**Next step requested from operator:** approve targeted fixes for the four blockers (no scope expansion), then proceed with the manual device matrix runs defined in `.lovable/production-readiness-test-plan.md`.
