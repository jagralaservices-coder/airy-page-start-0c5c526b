# MAXORA Enterprise Accounting Module — Build Plan

This is a very large, ERP-grade module (comparable to Tally / Zoho Books / Odoo Accounting). It cannot be built safely in a single turn — it needs a **schema foundation first**, then progressive layers on top. I'll ship it in **6 approved phases**, each independently useful, with automatic posting hooks added incrementally so nothing in your live POS breaks.

Below is the full plan. Once you approve, I'll start with Phase 1 (schema + Chart of Accounts + posting engine).

---

## Architecture Overview

Core principle: **one canonical Journal**. Every financial event (bill, refund, purchase, expense, payment, credit note, asset, depreciation, payroll) writes a balanced set of debit/credit lines into the same journal. All reports (Trial Balance, P&L, Balance Sheet, Ledgers, GST) are derived from that journal — no parallel truth.

```text
 Billing ─┐
 Purchase ┤
 Expense  ┤
 Refund   ├──► posting-engine ──► journal_entries ──► journal_lines
 CreditNt ┤                          │                     │
 Payment  ┤                          ▼                     ▼
 Assets   ┤                     accounting_periods    account_balances (materialized)
 Payroll ─┘                          │
                                     ▼
                    Trial Balance / P&L / Balance Sheet / Cash Flow / Ledgers
```

Store scoping: every journal line carries `store_id` + `cost_center_id`. Consolidated view = sum across stores; store-wise view = filter.

RLS: Owner/Accountant full; Store Manager read own store; Cashier no access. Reuse existing `has_role` / `can_manage_store` functions.

---

## Phase 1 — Foundation (Schema + Posting Engine + Chart of Accounts UI)

**Database**
- `chart_of_accounts` (id, merchant_id, code, name, type: asset/liability/equity/income/expense, subtype, parent_id, is_system, is_active, opening_balance, currency)
- `accounting_periods` (fiscal year, month, status: open/closed/locked)
- `journal_entries` (id, merchant_id, store_id, entry_no, entry_date, source_type, source_id, narration, status, created_by, approved_by, reversed_by)
- `journal_lines` (entry_id, account_id, store_id, cost_center_id, debit, credit, party_type, party_id, tax_code, metadata) — CHECK sum(debit)=sum(credit) via trigger
- `cost_centers` (id, merchant_id, name, type: department/store/project/kitchen/warehouse)
- `account_balances` (materialized daily snapshot per account/store for fast reports)
- Seed a **default Indian COA** on merchant creation (Cash, Bank, Sales, Purchases, CGST/SGST/IGST Payable & Receivable, AR, AP, Inventory, COGS, Rent, Salary, Electricity, Marketing, Discounts, Round-Off, Retained Earnings, Opening Balance Equity, etc.)
- RLS + GRANTs on all tables

**Posting engine** — `src/lib/accounting/postingEngine.ts`
- `postJournal({ source, lines, storeId, date, narration })` — validates balance, writes entry + lines atomically via edge function `accounting-post-journal`
- Deterministic idempotency key per source (bill_id, purchase_id, etc.) — reposting is safe
- Reversal helper (`reverseJournal(entryId, reason)`)

**UI (new `/accounting` route, role-gated)**
- Accounting shell with sidebar: Dashboard, COA, Journal, Ledgers, Reports, Banking, Tax, Assets, Budgets, Settings
- **Chart of Accounts page** — tree view, create/edit/deactivate, opening balances, import default COA
- Dashboard cards (Today's revenue/expenses, Cash, Bank, AR, AP, Profit today/month, Tax payable/receivable) — all derived queries

---

## Phase 2 — Automatic Postings from Existing Transactions

Wire the posting engine into every existing flow (no UI change for cashiers):

| Source | Debit | Credit |
|---|---|---|
| Cash sale | Cash | Sales, Output CGST, Output SGST, Round-off |
| Card/UPI sale | Bank/Gateway Clearing | Sales + taxes |
| Credit sale | AR (customer) | Sales + taxes |
| Customer payment | Cash/Bank | AR |
| Refund | Sales Return + taxes | Cash/Bank/AR |
| Credit note | Sales Return | Customer Credit Liability |
| Purchase (cash) | Inventory/Expense + Input GST | Cash/Bank |
| Purchase (credit) | Inventory + Input GST | AP (supplier) |
| Supplier payment | AP | Cash/Bank |
| Expense | Expense head + Input GST | Cash/Bank |
| Stock adjustment | Inventory Loss | Inventory |
| Gateway settlement | Bank | Gateway Clearing (net of fees → Payment Gateway Fees expense) |

Hooks added in: `POSContext.finalizeOrder`, `sales-returns`, `credit_ledger`/`credit_payments`, `purchase_orders`, `expenses`, `stock_adjustments`, `gateway_settlements`. All idempotent, all queued through the existing offline queue so offline bills post to journal on sync.

---

## Phase 3 — Ledgers, Journal, Trial Balance, P&L, Balance Sheet, Cash Flow

- **Journal page** — list with filters (date, store, source, account), drill-down, manual journal entry dialog, recurring template, approval workflow (draft → posted), reverse entry
- **General Ledger** page — pick account → running balance, opening/closing, drill to source document; presets for Customer Ledger, Supplier Ledger, Cash, Bank, GST, Inventory
- **Trial Balance** — as-of date, opening/debit/credit/closing, difference indicator, drill-through
- **P&L** — period picker, revenue → COGS → gross profit → opex → net profit, comparative (this month vs last)
- **Balance Sheet** — current/fixed assets, current/long-term liabilities, equity, retained earnings computed from closed periods
- **Cash Flow** — indirect method: operating/investing/financing, opening/closing cash
- All reports store-filterable & consolidated; export to **PDF / Excel / CSV / Print**

---

## Phase 4 — Banking, Tax, AR/AP

- `bank_accounts` table, transfers, deposits, withdrawals, **bank reconciliation** UI (import CSV statement, auto-match by amount+date+reference, manual match, unreconciled queue)
- **Tax Register** — output/input GST by rate, HSN summary, **GSTR-1 / GSTR-3B ready** export (JSON + Excel)
- **AR Aging** (0-30/31-60/61-90/90+), Collection history, dunning list
- **AP Aging**, payment schedule, outstanding payables

---

## Phase 5 — Assets, Depreciation, Budgets, Cost Centers, Multi-Outlet

- `fixed_assets` (category, purchase date, cost, salvage, useful life, method: SLM/WDV, location/store), disposal & transfer flows
- Scheduled edge function `accounting-run-depreciation` — monthly auto-post depreciation entries
- `budgets` + `budget_lines` (monthly, department/category/store), **Budget vs Actual** report with variance alerts
- Cost center allocation on every expense/journal line; **Cost Center P&L**
- Multi-outlet: consolidated books (default) + per-store books (filter), inter-store transfer journal template

---

## Phase 6 — Audit, Approvals, Period Close, Performance

- `accounting_audit_log` — every create/edit/delete/approve/reverse with before/after JSON, actor, IP
- Approval workflow: manual journals > threshold require Owner approval; edit/void requires reason + audit entry
- **Period close**: lock a month → no further postings; reopen requires Owner + reason
- Performance: materialized `account_balances` refreshed via trigger on `journal_lines`; indexes on `(account_id, entry_date)`, `(store_id, entry_date)`, `(source_type, source_id)`; server-side aggregation edge functions for reports (no client-side million-row scans)
- Retained Earnings auto-roll on year-end close

---

## Role & Route Access

| Role | Access |
|---|---|
| super_admin / admin / owner | Full accounting |
| accountant (new role in `app_role` enum) | Full accounting, no store ops |
| store_manager | Read-only, own store scope |
| cashier | Blocked from `/accounting/*` |

Add `accountant` to the role enum + gate `/accounting` in `App.tsx`.

---

## Non-Goals for this build
- Payroll postings (schema-ready, hooks stubbed — marked "Future" as you requested)
- TDS (schema-ready, disabled)
- Multi-currency (single currency INR; structure supports adding later)

---

## Deliverable per phase
Each phase ships a working, testable slice. After each phase I'll pause for your validation before starting the next — same rhythm we've been using for Payment Hub, Store Isolation, etc.

**On approval I start Phase 1 immediately: migration for COA + journal tables, seed default Indian COA, posting engine, `/accounting` shell, Chart of Accounts UI, and Dashboard.**
