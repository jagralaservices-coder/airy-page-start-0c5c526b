## Scope (confirmed with you)

Priorities: **#1 Cashier menu blank**, **#2 Inventory deduction from Owner stock**, **#3 Subscription inheritance + #5 role badge**, **#4 Duplicate header**.

Out of scope for now (too big, will regress if bundled): global refactor of POSContext (2,845 lines), rewriting `useStoreDataSync`, DB integrity migration sweep, performance/render-loop hunt across the whole app. Those need their own passes — I'll flag concrete follow-ups at the end.

Merchant resolution rule you gave me: **cashier row itself carries owner/merchant + store link**. Staff table stays untouched.

---

## Phase 1 — Cashier menu not loading (#1)

**Root cause hypothesis** (from code trace):
`MenuGrid` reads `menuItems` from `POSContext`. `POSContext` loads menu via `useCloudData('menu_items', …)` which calls `sync-store-data` edge function keyed on `getCurrentStoreId()` from localStorage (`owner_selected_store_id` → `pos_active_store_data` → `pos_active_store`).

For a cashier who signs in via Supabase auth (not the PIN flow), those localStorage keys are never populated by the cashier login path — so `storeId` is null, query is disabled, menu stays empty. Owner works because `OwnerStoreSelectionDialog` writes `owner_selected_store_id`.

**Fix**:
1. In `SupabaseAuthContext` cashier/staff login path: after resolving `user_roles` row, if `role in ('cashier','staff','store_manager')` and `store_id` is present, write `owner_selected_store_id` + `pos_active_store_data` (id, name, merchant_id, business_type, subscription_tier resolved from merchant) — same shape owner selection uses.
2. Guarantee `POSContext` picks up the change: dispatch the existing `pos:store-changed` event (already used elsewhere) so `useCloudData` requery fires.
3. Verify `sync-store-data` edge function's RLS/merchant check doesn't reject cashier JWTs querying the owner's store — read the function, confirm it resolves merchant via `stores.merchant_id`, not from the caller's `user_roles.merchant_id` only.

**Success check (I'll run)**: build + tsgo passes; grep confirms cashier path writes the same keys owner does. Runtime verification is yours.

---

## Phase 2 — Subscription inheritance + role badge (#3, #5)

**Root cause**: `useSubscription` resolves merchantId from `customer?.id` / `userRole.customer_id` / `userRole.merchant_id` / `pos_active_store_data.customer_id`. For a cashier those are usually null → falls through to `setTier('basic')` default. `AppHeader` shows `tierLabel` → "Basic Plan".

**Fix**:
1. `useSubscription`: add resolution step — if merchantId still null after existing checks, query `user_roles` for the current user's row and read `merchant_id`/`customer_id`; if still null, resolve from `stores.merchant_id` using active store id. Cache the resolved id so we don't re-query.
2. Never default `tier` to `'basic'` when merchant lookup is pending — keep `loading=true` until we've either resolved or definitively failed. Header should show a skeleton, not a wrong badge.
3. `AppHeader` top-right: below the name, render `userRole.role` capitalized (Owner / Cashier / Manager / Admin). Source is `useSupabaseAuth().userRole.role` — no hardcoding.

---

## Phase 3 — Duplicate header (#4)

**Root cause**: `POSBillingPage` renders `BillingHeader`, and `CashierBillingPage` wraps it with an additional sticky "Cashier Mode · Auth Session" bar on top of the app's `AppHeader` from `MainLayout`. Screenshot shows Maxora bar + "Cashier Mode · Auth Session" bar = two headers.

**Fix**: Remove the extra sticky bar in `CashierBillingPage` for the `isCashier()` branch. Move the "Cashier Mode" indicator into `AppHeader` role display (Phase 2 already puts role under name). PIN-session branch keeps its slim bar because it has real per-shift info (name / code / logout) that doesn't belong in AppHeader.

---

## Phase 4 — Inventory deduction from Owner stock (#2)

**Root cause**: `useInventoryDeduction` filters `inventory_items` by `store_id` = active store. If cashier's active store == owner's store (fixed in Phase 1), deduction hits the shared row. Two remaining gaps:
1. Basic plan short-circuits deduction (`if (!hasRecipeDeduction) return;`). User said "Cashier sells Chicken Burger → inventory goes 20→19.8kg" — that requires recipe-based deduction regardless of plan tier for the merchant's actual (Platinum) plan. Phase 2 fixes the tier read, so this stops being a blocker.
2. No `inventory_transactions` log row is written. Add insert to `inventory_transactions` (source='sale', reference_id=order id, qty_delta negative, before/after qty) after each successful update. Table already exists.

**Fix**:
- Keep the existing deduction flow; add transaction-log insert.
- Add unit-mismatch guard: if `ingredient.unit !== invItem.unit`, log warning and skip (no silent bad math). Real unit conversion is a bigger feature — not in this pass.

---

## Technical notes

**Files touched**:
- `src/contexts/SupabaseAuthContext.tsx` — cashier login writes store keys
- `src/hooks/useSubscription.ts` — merchant fallback via user_roles/stores; no basic default while loading
- `src/components/layout/AppHeader.tsx` — role sub-label under user name
- `src/pages/CashierBillingPage.tsx` — remove duplicate sticky bar in auth-cashier branch
- `src/hooks/useInventoryDeduction.ts` — inventory_transactions log + unit guard
- Possibly `supabase/functions/sync-store-data/index.ts` if it rejects cashier JWTs (read first, only edit if needed)

**No DB migrations planned** unless Phase 1 investigation reveals `user_roles` for cashiers is genuinely missing `store_id`/`merchant_id` — then a targeted backfill + trigger, surfaced for your approval.

**Verification**: build passes, tsgo clean, grep-verify no hardcoded "basic"/"Cashier" strings introduced. Runtime end-to-end (owner creates item → cashier sees it → sells → stock drops) is on your side per your answer.

---

## Explicit non-goals this pass

- POSContext rewrite / single-context consolidation
- Realtime subscription audit
- Performance profiling (duplicate fetch elimination beyond what's incidental)
- Full RLS audit across 100+ tables
- IndexedDB / offline queue rework

If Phase 1-4 land clean, I'll propose Phase 5 (context consolidation) as its own plan.

Ready to proceed on your OK.