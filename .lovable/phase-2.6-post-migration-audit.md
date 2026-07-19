# Customer Migration Audit Report

## Migration Applied
`public.pos_customers` created with full isolation from `public.customers` (merchant registry).

## Schema Verification
| Property | Value |
|---|---|
| Primary key | `id uuid` |
| Tenant scope | `store_id uuid NOT NULL → stores(id) ON DELETE CASCADE` |
| Merchant convenience | `merchant_id uuid` (denormalized, nullable) |
| Domain fields | `name (NOT NULL), phone, email, address, city, state, pincode, credit_limit, credit_balance, notes` |
| Phase 2.5 metadata | `metadata jsonb NOT NULL DEFAULT '{}'::jsonb` |
| Timestamps | `created_at, updated_at` with `set_updated_at` trigger |

## RLS Policies
All four CRUD policies on `pos_customers` gate access via `public.can_manage_store(store_id)`:
- `pos_customers_select` — SELECT for authenticated
- `pos_customers_insert` — INSERT for authenticated
- `pos_customers_update` — UPDATE for authenticated
- `pos_customers_delete` — DELETE for authenticated

No `anon` grant. `service_role` has full access for edge-function operations.

## Indexes
- `pos_customers_store_idx (store_id)` — sync scoping
- `pos_customers_store_name_idx (store_id, lower(name))` — name search
- `pos_customers_store_phone_idx (store_id, phone)` — phone lookup
- `pos_customers_store_phone_uniq UNIQUE (store_id, phone) WHERE phone IS NOT NULL` — dedup
- `pos_customers_version_idx ((metadata->>'version_number'))` — Phase 2.5 conflict detection

## Triggers
- `pos_customers_meta_insert BEFORE INSERT` → `stamp_metadata_on_insert` — stamps `version_number=1`
- `pos_customers_meta_update BEFORE UPDATE` → `enforce_metadata_versioning` — rejects stale writes with SQLSTATE 40001
- `pos_customers_set_updated_at BEFORE UPDATE` → `set_updated_at`

## Realtime
- `REPLICA IDENTITY FULL` so payloads include `metadata` for client-side conflict checks
- Added to `supabase_realtime` publication
- Client binding in `syncEngine.bindRealtime` filtered by `store_id=eq.{storeId}`

## Isolation Guarantees
| Concern | Status |
|---|---|
| POS customers cannot enter merchant registry | ✔ — `buildPayload('customers')` now targets `pos_customers` exclusively |
| Merchant records cannot enter POS customer pull | ✔ — `pullCustomers` filters `store_id=eq.{storeId}` against `pos_customers` only |
| Cross-tenant realtime broadcast | ✔ — `store_id` filter on subscription |
| Subscription / approval / onboarding workflows | ✔ — `pos_customers` has none of those columns |
| Admin merchant tools | ✔ — untouched, still operate on `public.customers` / `public.merchants` |

## Code Wiring
- `src/lib/syncEngine.ts` `supabaseTableFor('customers') → 'pos_customers'`
- `src/lib/syncEngine.ts` `buildPayload('customers')` now emits `store_id`, `credit_limit`, `credit_balance`, `notes`
- `src/lib/syncEngine.ts` `pullCustomers` switched to `pos_customers` with `store_id` filter
- `src/lib/syncEngine.ts` realtime channel binds `pos_customers` with `store_id` filter
- Queue drain `DISABLED_SYNC_TABLES` set is now empty — customer writes flow to the server

## Verdict
**PASS** — customer storage is fully isolated, store-scoped, version-protected, and realtime-broadcast. Cross-tenant leakage is structurally impossible.

---

# Credit Migration Audit Report

## Migration Applied
`public.credit_ledger` and `public.credit_payments` created with full Phase 2.5 metadata coverage.

## credit_ledger Verification
| Property | Value |
|---|---|
| Primary key | `id uuid` |
| Tenant scope | `store_id uuid NOT NULL → stores(id) ON DELETE CASCADE` |
| Customer link | `customer_id uuid NOT NULL → pos_customers(id) ON DELETE RESTRICT` |
| Order link | `order_id uuid → orders(id) ON DELETE SET NULL` |
| Domain fields | `due_amount, paid_amount, status (CHECK in open/partial/paid/void), due_date, notes` |
| Metadata | `metadata jsonb NOT NULL DEFAULT '{}'` |
| RLS | 4 policies via `can_manage_store(store_id)` |
| Indexes | `(store_id, customer_id)`, `(store_id, status)`, `(store_id, due_date)`, `(order_id)`, `(metadata->>'version_number')` |
| Triggers | metadata insert/update + `set_updated_at` |
| Realtime | publication + `REPLICA IDENTITY FULL` |

## credit_payments Verification
| Property | Value |
|---|---|
| Tenant scope | `store_id uuid NOT NULL → stores(id) ON DELETE CASCADE` |
| Ledger link | `credit_ledger_id uuid NOT NULL → credit_ledger(id) ON DELETE CASCADE` |
| Domain fields | `amount, payment_method, reference` |
| Metadata | `metadata jsonb NOT NULL DEFAULT '{}'` |
| RLS | 4 policies via `can_manage_store(store_id)` |
| Indexes | `(credit_ledger_id)`, `(store_id, created_at DESC)`, `(metadata->>'version_number')` |
| Triggers | metadata insert/update + `set_updated_at` |
| Realtime | publication + `REPLICA IDENTITY FULL` |

## Code Wiring
- `supabaseTableFor('credit_ledger') → 'credit_ledger'`, `('credit_payments') → 'credit_payments'`
- `pullCreditLedger` and `pullCreditPayments` re-enabled in `sync()`
- Realtime bindings restored with `store_id` filters
- Queue drain no longer drops credit items — they now reach the server through batch upsert
- `sync-store-data` edge function pre-existing handlers (lines 743-820) are now backed by real tables

## Reporting Readiness
Indexes are tuned for:
- Open credit per store: `(store_id, status)` index supports `WHERE store_id=… AND status<>'paid'`
- Customer credit history: `(store_id, customer_id)` covers per-customer ledgers
- Aging reports: `(store_id, due_date)` for overdue scans
- Payment history: `(store_id, created_at DESC)` for recent payments

## Verdict
**PASS** — credit ledger and payments are tenant-scoped, FK-protected, version-protected, and realtime-broadcast. Queue poisoning is no longer possible because the upstream cause (missing tables) is resolved.

---

# Updated Realtime Coverage Report

| Table | Filter | Conflict-aware | Status |
|---|---|---|---|
| orders | `store_id=eq.{storeId}` | ✔ via `applyConflictRules` | live |
| menu_items | `store_id=eq.{storeId}` | ✔ via `applyConflictRulesMap` | live |
| products (inventory) | `store_id=eq.{storeId}` | ✔ via `applyConflictRulesMap` | live |
| pos_customers | `store_id=eq.{storeId}` | ✔ via `applyConflictRules` | live (new) |
| credit_ledger | `store_id=eq.{storeId}` | ✔ via `applyConflictRules` | live (new) |
| credit_payments | `store_id=eq.{storeId}` | safeMerge only (no envelope) | live (new) |

All six bindings live on a single channel `sync-{storeId}`. The channel is torn down and rebound on:
- `'storage'` event (other-tab store switch)
- `'pos:active-store-changed'` custom event (same-tab switch from `OwnerStoreSelectionDialog`, `StaffLogin`)
- 5s drain tick fallback (`drainQueue` detects `storeId !== this.activeStoreId`)
- 30s pull tick fallback (`sync` detects same)

`customers` (merchant registry) is no longer subscribed by POS clients — it is reserved for admin tooling only.

Cross-tenant broadcast is structurally impossible across all six bindings.

---

# Updated Production Validation Report

## Blocker Status (CRIT/HIGH from previous report)

| ID | Status |
|---|---|
| CRIT-1 — missing credit tables | **RESOLVED** — tables created, sync re-enabled, queue cannot poison |
| CRIT-2 — customer/merchant table conflation | **RESOLVED** — `pos_customers` created, sync routed there, merchant registry untouched |
| HIGH-1 — same-tab realtime rebind | **RESOLVED** — custom event + 5s/30s tick fallbacks |
| HIGH-2 — unfiltered customer realtime | **RESOLVED** — `pos_customers` binding filtered by `store_id` |
| MED-2 — silent pull errors | partially addressed (`pullCustomers` now logs); other pulls still swallow |
| MED-3 — duplicate dynamic import | RESOLVED |

## Static Validation Results

| Phase | Pre-fix Static Verdict | Post-fix Static Verdict |
|---|---|---|
| A. Core Billing | clean except credit | **clean** |
| B. Inventory | clean | **clean** |
| C. Customer | blocked by CRIT-2 | **clean** — routes to `pos_customers` |
| D. Multi-Device | leakage via HIGH-2 | **clean** — all 6 bindings store-scoped |
| E. Offline | credit ops would poison | **clean** — credit queue items now flow to server |
| F. Store Switching | HIGH-1 broken | **clean** — instant rebind on switch |
| G. Stress | clean | **clean** |

## Release Criteria

| Criterion | Status |
|---|---|
| Customer synchronization | ✔ structurally correct, requires manual Phase C run to certify |
| Credit synchronization | ✔ structurally correct, requires manual Phase A.B7/B8 + dedicated credit run |
| Multi-device validation | ✔ structurally correct, requires manual Phase D run |
| Offline validation | ✔ structurally correct, requires manual Phase E run |
| No cross-tenant leakage | ✔ structurally impossible (RLS + filtered realtime + dedicated tables) |

## Remaining Steps for Production Go-Live

Static + database-level audit no longer surfaces blockers. The next gate is execution on real hardware per `.lovable/production-readiness-test-plan.md`:

1. Phase C — Customer Validation (create/update/credit-link/multi-device customer)
2. Dedicated Credit Workflow run (sale-on-credit, partial payment, full payment, void, aging report)
3. Phase D — Multi-Device with two devices on same store editing the same customer + credit row
4. Phase E — Offline cycle including credit operations
5. Phase F — Store-switch verifying instant realtime rebind to the new store's pos_customers / credit channels

## Verdict

**Static validation: PASS. Awaiting manual device-matrix execution.**

No critical or high-severity blockers remain in the offline-first stack. The app is cleared for hands-on production validation. Pilot deployment should remain on hold until the manual Phase C, Credit, D, E, and F runs are completed and signed off.
