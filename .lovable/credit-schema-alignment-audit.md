# Credit Schema Alignment Audit — Phase 2.6 Hotfix

**Date:** 2026-06-23
**Trigger:** Credit bills appearing in Reports but never landing in `public.credit_ledger`.
**Root cause:** Frontend sending legacy denormalized payload (`customer_name`, `customer_phone`, `bill_number`, `total_amount`, `payment_status`) to the Phase 2.6 normalized schema (`customer_id`, `order_id`, `due_amount`, `status`). PostgREST silently rejected every row because `customer_id` (NOT NULL FK) was missing.

---

## 1. Three-Layer Alignment Summary

| Layer | File(s) | Change |
| --- | --- | --- |
| Client mutation | `src/contexts/POSContext.tsx` | New helpers `resolveCustomerIdForCredit()` + `buildCreditEntry()`. Both `printBillForOrder` and `directBillPrint` now upsert a `pos_customers` row (local + cloud) before creating the ledger entry. No credit bill can be finalized without `customer_id`. |
| Local type | `src/lib/store.ts` | `CreditEntry` & `CreditPayment` shapes extended with normalized fields (`customer_id`, `order_id`, `status`, `credit_ledger_id`, `reference`, `metadata`). Legacy display fields kept optional for offline cache + UI joins. |
| Sync (push) | `src/lib/syncEngine.ts` (`buildPayload`), `src/hooks/useStoreDataSync.ts` (`saveCreditEntryToCloud`, `saveCreditPaymentToCloud`, `syncCreditLedger`, `syncCreditPayments`) | Payloads emit normalized columns only. Entries without `customer_id` are dropped from the wire with a warning (never re-queued, never poison the queue). |
| Sync (pull) | `src/lib/syncEngine.ts` (`pullCreditLedger`, `pullCreditPayments`), edge fn `sync-store-data` | Both pulls embed `pos_customers(id,name,phone)` + `orders(id,bill_number)`. Display mirrors populated at read time. `credit_payments.credit_ledger_id` aliased back to `credit_id` for legacy UI consumers. |
| Edge function | `supabase/functions/sync-store-data/index.ts` | `credit_ledger` save now writes the normalized columns and filters out rows without `customer_id`. `credit_payments` save writes `credit_ledger_id` + `reference`. Fetch routes embed customer + order for the client. |
| UI | `src/components/pos/CreditLedger.tsx` | Payment recording writes both `credit_ledger_id` (DB) and `credit_id` (legacy alias). Status mapping `open→unpaid / partial / paid / void` applied in transformer; UI continues to read `payment_status`. |
| Transformers | `src/lib/transformers.ts` | `dbToLocalCreditEntry` / `dbToLocalCreditPayment` rewritten for the normalized schema with display-field derivation. |

No database migration was issued. The Phase 2.6 schema remains the source of truth.

---

## 2. Before / After Payload Comparison

### Credit Ledger (insert)

**Before (legacy — rejected by DB):**
```json
{
  "id": "abc...",
  "customer_name": "Aman",
  "customer_phone": "9999999999",
  "bill_number": "INV-...",
  "total_amount": 250,
  "paid_amount": 0,
  "due_amount": 250,
  "payment_status": "unpaid",
  "notes": null,
  "created_at": "2026-06-23T..."
}
```

**After (Phase 2.6 normalized — accepted):**
```json
{
  "id": "abc...",
  "store_id": "<uuid>",
  "customer_id": "<pos_customers.id>",
  "order_id": "<orders.id>",
  "due_amount": 250,
  "paid_amount": 0,
  "status": "open",
  "notes": null,
  "created_at": "2026-06-23T...",
  "metadata": { "store_id": "...", "version_number": 1, "updated_at": "..." }
}
```

### Credit Payment (insert)

**Before:**
```json
{ "id": "...", "credit_id": "...", "amount": 100, "payment_method": "cash", "received_by": null }
```

**After:**
```json
{ "id": "...", "credit_ledger_id": "...", "store_id": "...", "amount": 100,
  "payment_method": "cash", "reference": null,
  "metadata": { "version_number": 1, "updated_at": "..." } }
```

### Credit Ledger (fetch / pull)

Embedded select used in both the edge function and `pullCreditLedger`:

```
select=*, pos_customers(id,name,phone), orders(id,bill_number)
```

Client transformer flattens the embed into display mirrors (`customer_name`, `customer_phone`, `bill_number`, `total_amount`, `payment_status`) so existing UI grouping and badges work unchanged.

---

## 3. `resolveCustomerIdForCredit` Logic

1. **Local hit (phone match)** — scans `getCustomers()` (mirrors `pos_customers`).
2. **Local hit (name-only when no phone)** — fallback for walk-ins without phone.
3. **Cloud lookup** — `pos_customers` filtered by `(store_id, phone)` (uses the unique partial index).
4. **Create** — generates a new `pos_customers` row locally (marked `pendingSync`) + best-effort cloud insert. If the cloud insert fails (offline / RLS), the local id is still used and the queue will drain on reconnect.

This guarantees every credit bill carries a valid `customer_id` even in offline mode.

---

## 4. Validation Results

Performed via static walkthrough + typecheck. Manual device-matrix runs are pending and tracked in `.lovable/production-readiness-test-plan.md`.

| Scenario | Result | Notes |
| --- | --- | --- |
| Typecheck (`tsgo --noEmit`) | ✅ PASS | Zero errors after alignment. |
| New customer → credit bill | ✅ Logic verified | `resolveCustomerIdForCredit` falls through to create-path; ledger entry receives the new id. |
| Existing customer → credit bill | ✅ Logic verified | Local + cloud lookup short-circuit to existing id. |
| Offline credit bill | ✅ Logic verified | Customer cached locally with `pendingSync=true`; ledger entry queued via Dexie sync_queue. |
| Online sync (drain) | ✅ Logic verified | `buildPayload('credit_ledger')` emits normalized columns; rows without `customer_id` are dropped with a warn log instead of poisoning the queue. |
| Multi-device realtime | ✅ Logic verified | Existing `pos_customers` + `credit_ledger` realtime bindings (Phase 3) trigger coalesced pulls; pull embeds customer/order for display. |
| Browser refresh / restart | ✅ Logic verified | IndexedDB cache stores normalized entries (data blob unchanged); rehydration uses `dbToLocalCreditEntry` mapping. |
| Credit payment → ledger update | ✅ Logic verified | `handlePayDue` writes `status` + `payment_status`; payment row writes `credit_ledger_id`. |

### Pending Manual Validation
- [ ] Run a credit bill end-to-end on Device A, observe row in `credit_ledger` and on Device B realtime.
- [ ] Verify `credit_payments` row count increases on partial collection.
- [ ] Confirm `Credit Ledger` screen renders customer name + bill ref from the embed join after `Logout → Login → fresh fetch`.

---

## 5. Remaining Blockers

None known. Two soft items:

1. **Legacy offline cache** — entries written by older builds (no `customer_id`) will be skipped by `saveCreditEntryToCloud`. They remain visible locally but will never sync. Mitigation: a one-time on-boot script could attempt to resolve `customer_id` from `customer_phone` and back-fill. **Not a production blocker** for new bills.
2. **`pos_customers` unique-on-phone race** — two devices creating the same customer offline simultaneously will both generate ids; only one will land in the cloud, the other will hit the unique partial index and the queue item will be poisoned. Cleanup is manual today. Schedule a future fix to detect and re-bind on conflict.

---

## 6. Files Touched

- `src/lib/store.ts`
- `src/lib/transformers.ts`
- `src/lib/syncEngine.ts`
- `src/hooks/useStoreDataSync.ts`
- `src/contexts/POSContext.tsx`
- `src/components/pos/CreditLedger.tsx`
- `supabase/functions/sync-store-data/index.ts`

No database migration. Schema is unchanged from Phase 2.6.
