# CRIT-1 — Credit Architecture Report

## Database reality

`public.credit_ledger` and `public.credit_payments` **do not exist** in the database. Verified via `information_schema.tables`.

## What the code expects

Credit is a fully-implemented feature end-to-end **except for the tables themselves**:

| Layer | References |
|---|---|
| Feature catalog | `src/lib/featureCatalog.ts` lists `credit_ledger` as a feature included in basic/gold/platinum plans |
| Local store | `src/lib/store.ts` keys `pos_credit_ledger`, `pos_credit_payments`; `mirrorToIDB('credit_ledger', …)` on every credit write |
| IDB | `src/lib/idb.ts` declares `credit_ledger` as a core table; `idbMigration.ts` migrates the legacy localStorage keys |
| Sync engine | `pullCreditLedger`, `pullCreditPayments`, realtime bindings on both tables, `buildPayload('credit_ledger')`, `supabaseTableFor('credit_ledger') → 'credit_ledger'` |
| Edge function | `supabase/functions/sync-store-data/index.ts` has full save/fetch/delete handlers for `data_type='credit_ledger'` and `data_type='credit_payments'` (lines 743-820) — they call `supabase.from('credit_ledger')…` which also fails |
| UI hooks | `useStoreInitializer.ts:501,540`, `useStoreDataSync.ts:627,658,857,908`, `useAnalytics.ts:172,176` — all read/write credit |
| Demo data | `src/lib/demoData.ts`, `supabase/functions/generate-demo-data/index.ts` insert into `credit_ledger` / `credit_payments` |
| Backup | `src/lib/backupUtils.ts` includes both in snapshots |

## Conclusion: scenario (A) — tables should exist and are missing

Credit is not "migrated elsewhere". It is a built feature whose tables were never migrated to this database. Every credit operation today silently 404s; the offline-first layer just made the failures audible by poisoning the queue.

## Proposed schema (awaiting approval — not yet migrated)

```
public.credit_ledger
  id                 uuid PK
  store_id           uuid NOT NULL REFERENCES stores(id)
  customer_id        uuid NOT NULL                       -- FK added after pos_customers exists (CRIT-2)
  order_id           uuid REFERENCES orders(id)
  due_amount         numeric NOT NULL
  paid_amount        numeric NOT NULL DEFAULT 0
  status             text NOT NULL DEFAULT 'open'         -- open | partial | paid | void
  due_date           date
  notes              text
  metadata           jsonb                                -- Phase 2.5 envelope
  created_at         timestamptz NOT NULL DEFAULT now()
  updated_at         timestamptz NOT NULL DEFAULT now()

public.credit_payments
  id                 uuid PK
  store_id           uuid NOT NULL REFERENCES stores(id)
  credit_ledger_id   uuid NOT NULL REFERENCES credit_ledger(id) ON DELETE CASCADE
  amount             numeric NOT NULL
  payment_method     text NOT NULL                        -- cash | card | upi | …
  reference          text
  metadata           jsonb
  created_at         timestamptz NOT NULL DEFAULT now()
```

- RLS on both: `can_manage_store(store_id)` for SELECT/INSERT/UPDATE/DELETE for authenticated; full access for service_role.
- Indexes: `credit_ledger(store_id, customer_id)`, `credit_ledger(store_id, status)`, `credit_payments(credit_ledger_id)`.
- Triggers: reuse `enforce_metadata_versioning` + `stamp_metadata_on_insert`.
- `ALTER PUBLICATION supabase_realtime ADD TABLE credit_ledger, credit_payments;`
- `REPLICA IDENTITY FULL` on both so realtime payloads include `metadata` for conflict checks.
- GRANT statements per the project's standing rule.

Note: `customer_id` FK on `credit_ledger` is left **unenforced** until `pos_customers` is created (CRIT-2). It is stored, and we add the FK in the same migration that adds `pos_customers`.

## Interim safety applied this phase (no schema change)

To stop queue poisoning and pull-cycle noise immediately:

1. `syncEngine.pullCreditLedger` and `pullCreditPayments` are short-circuited.
2. `credit_ledger` and `credit_payments` realtime bindings are removed.
3. `drainQueue` silently acks any pending `credit_ledger` / `credit_payments` queue item with a warn — no upserts attempted.
4. The edge function code paths in `sync-store-data` are unchanged (still error if invoked by other code paths like `useStoreDataSync`), but the offline-first queue no longer routes to them. Existing direct callers from `useStoreDataSync` / `useStoreInitializer` will continue to log "table does not exist" — that is pre-existing behavior outside the offline-first scope and will be cleared by the migration.

Credit UI still functions locally (writes hit IndexedDB and the in-memory store); credit data simply does not reach the server until tables are approved.

---

## Decision required

**Approve creating `public.credit_ledger` and `public.credit_payments`** per the schema above. On approval I will:
1. Run the migration (tables + GRANTs + RLS + policies + metadata triggers + publication).
2. Re-enable the four short-circuited paths in `syncEngine.ts`.
3. Re-run the credit workflow validation block of the production test plan.

Alternative — if you prefer to defer credit as a feature, say so and I'll keep the short-circuits permanent and hide the credit UI behind the existing feature flag.
