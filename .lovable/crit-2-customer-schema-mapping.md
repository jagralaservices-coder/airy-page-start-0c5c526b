# CRIT-2 — Customer Schema Mapping Report

## What the database actually holds

`public.customers` (41 columns) is **the merchant onboarding registry**. Every column tells the same story: `business_name`, `owner_name`, `owner_email`, `owner_user_id`, `approval_status`, `subscription_plan`, `subscription_tier`, `subscription_start/end`, `max_stores`, `staff_limit`, `outlet_limit`, `gov_id_url`, `mobile_verified`, `email_verified`, `approved_at/by`, `rejected_at/reason`, `suspended_at/by/reason`, `ref_code`, `enabled_addons`.

Current row sample: 4 rows, 100% merchant-shaped (business_name + approval_status + owner_user_id set on all of them). 0 rows look like POS walk-in customers.

`public.merchants` (25 columns) **also exists** and is independently used by `secure-store-login`, `create-store`, `delete-store`, `useSubscription`, etc. The codebase has been operating with two parallel "merchant" tables — `customers` and `merchants` — bridged by `get_user_customer_id()` and `stores.customer_id`. That predates the offline-first work and is out of scope here. We are not unifying them in this phase.

`public.orders.customer_id` is a nullable uuid with no enforced FK in this listing — historically POS orders intended to reference a POS customer, but no `pos_customers` table exists. Today, `customer_id` on an order is effectively unused for POS walk-ins; only `customer_name` / `customer_phone` (the inline fields the sync engine maps) carry that data.

## Who writes to `public.customers` today

| Caller | Intent | Correct? |
|---|---|---|
| `auth/AuthPage.tsx` (signup) | Insert new merchant on signup | ✔ merchant flow |
| `admin-create-merchant`, `create-owner`, `approve-owner`, `reject-owner`, `delete-owner`, `suspend-user`, `activate-user` | Admin lifecycle on merchants | ✔ merchant flow |
| `SupabaseAuthContext` line 202, `useSubscription`, `approvalSlice` | Read merchant data | ✔ merchant flow |
| **`src/lib/syncEngine.ts` `buildPayload('customers', …)`** | **Write POS walk-in name/phone/address** | **✗ wrong table** |
| **`src/lib/syncEngine.ts` `pullCustomers`** | **Pull "customers" with no filter** | **✗ pulls merchants** |
| **`src/lib/syncEngine.ts` realtime channel** | **Subscribe to all customer changes, no filter** | **✗ cross-tenant broadcast** |
| `billShareUtils.ts:185, 429` | Lookup customer by phone for bill share | ✗ also wrong, but low-volume read; RLS limits damage |
| `ExecutiveDashboardPage` | `count(*)` of customers | mixed — counts merchants but labeled "customers" in UI |

## Required separation

POS end-customers need their own table. Proposed schema (awaiting approval — not yet migrated):

```
public.pos_customers
  id           uuid PK
  store_id     uuid NOT NULL REFERENCES stores(id)
  name         text NOT NULL
  phone        text
  email        text
  address      text
  city         text
  state        text
  pincode      text
  credit_limit numeric DEFAULT 0
  credit_balance numeric DEFAULT 0
  notes        text
  metadata     jsonb     -- Phase 2.5 envelope
  created_at   timestamptz DEFAULT now()
  updated_at   timestamptz DEFAULT now()

  UNIQUE (store_id, phone) WHERE phone IS NOT NULL
```

- RLS: scope all reads/writes via `can_manage_store(store_id)`. No anon grant.
- Triggers: reuse `enforce_metadata_versioning` + `stamp_metadata_on_insert` (already deployed for orders/customers/menu_items/products).
- Add to `supabase_realtime` publication with `REPLICA IDENTITY FULL`.

## Migration path for existing POS data

There is **no POS customer data in `public.customers` today** (4 rows, all merchant-shaped). Nothing to migrate from DB. Some installations may have local POS customers in IndexedDB / localStorage that have never reached the server because RLS blocked the write — those will be flushed to `pos_customers` on first drain after fix.

Risk: any historical attempt to enqueue a POS customer into `public.customers` that DID succeed under a permissive RLS window. To verify, a scan can be run:
```sql
SELECT id, name, phone FROM public.customers
WHERE business_name IS NULL AND approval_status IS NULL
  AND owner_user_id IS NULL AND subscription_plan IS NULL;
```
Current count: **0**. Safe.

## Required code changes (after table is approved & created)

| File | Change |
|---|---|
| `src/lib/syncEngine.ts` `buildPayload('customers')` | rename case to `'pos_customers'`, change target table |
| `src/lib/syncEngine.ts` `pullCustomers` | `from('pos_customers').eq('store_id', storeId)` |
| `src/lib/syncEngine.ts` realtime binding | rebind to `pos_customers` with `store_id` filter |
| `src/lib/idb.ts` | add `pos_customers` core table (and remove `customers` from CoreTable, or alias it) |
| `src/lib/store.ts` `mirrorToIDB` callers for customers | route to `pos_customers` |
| `billShareUtils.ts` customer lookups | route to `pos_customers` |
| `useAnalytics`, dashboard customer counts | switch to `pos_customers` |

## Interim safety applied this phase (no schema change)

Until the new table exists I have **stopped the offline-first layer from touching `public.customers`** so we cannot pollute the merchant registry or broadcast cross-tenant changes:

1. Removed the unfiltered `customers` realtime binding from `syncEngine.bindRealtime`.
2. `drainQueue` now silently acks any pending `customers` queue item with a warn (no DB write).
3. `pullCustomers` is short-circuited.

POS customer create/edit still writes to IndexedDB and behaves locally — it just no longer reaches the server. This freezes POS customer sync until `pos_customers` is approved, which is the correct interim behavior. Merchant onboarding flows are untouched.

---

## Decision required

**Approve creating `public.pos_customers`** per the schema above, plus the code rewiring in the table at §"Required code changes". Once approved I will issue the migration and the code patch together.
