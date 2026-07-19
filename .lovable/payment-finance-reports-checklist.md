# 💳📊 Payment & Finance Reports — Availability Checklist

> Audit run against current routes, `MoreReportsPage`, `AdvancedReportsPage`, `CashFlowPage`, `CreditLedgerPage`, `ExpensesPage`, `FinancialAnalyticsPage`.

---

## 💳 Payment Reports

**✅ Available**
- Cash Collection Report — `/cash-flow` (DailySalesReport: cash in/out, sessions)
- Cash Payment Report — `/reports/more?r=payment` (payment-mode split), `/admin/finance` (Payment Methods pie)
- UPI Payment Report — `/reports/more?r=payment`, `/admin/finance`
- Card Payment Report — `/reports/more?r=payment`, `/admin/finance`
- Wallet Payment Report — `/reports/more?r=payment` (wallet bucket from `payments.method`)
- Credit Sales Report — `/credit-ledger` + `/reports/sales` (credit slice in Payment Mix)
- Split Payment Report — derived from `payments` table (multiple rows per order shown in `/reports/order`)
- Payment Collection Report — `/reports/more?r=payment` (collected vs pending)
- Outstanding Credit Report — `/credit-ledger` (outstanding KPI + per-customer balance), `AdvancedReportTabs` (Outstanding metric)
- Cash Drawer Report — `/cash-flow` (opening/closing balance, drawer movements per `cash_sessions`)

**🟡 Partial / Derivable**
- Payment Settlement Report — settlement status visible per order, no dedicated settlement card
- Payment Reconciliation Report — manual via `/cash-flow` close-out; no automated reconciliation report

**❌ Not Available**
- (none fully missing)

---

## 📊 Finance & Accounting Reports

**✅ Available**
- Profit & Loss (P&L) Report — `/advanced-reports → pl` (`get_pl_report`)
- Cash Flow Report — `/cash-flow`, `/admin/finance` (30-day cash flow trend)
- Income & Expense Report — `/expenses` + P&L income side
- Tax Summary Report — `/reports/more?r=tax`, `AdvancedReportsPage → TaxReport`
- GST Report — `/reports/more?r=tax` (CGST/SGST split), `AdvancedReportsPage` (CGST/SGST/IGST)
- Tax Register Report — `/reports/more?r=tax` (bill-wise taxable + tax columns, CSV export)
- Expense Analysis Report — `/expenses` (category breakdown + trend)

**🟡 Partial / Derivable**
- Accounts Receivable Report — covered by Outstanding Credit (`/credit-ledger`), no dedicated A/R aging buckets
- Bank Reconciliation Report — payment-mode totals exist in `/admin/finance`, no bank-statement matching UI

**❌ Not Available**
- Balance Sheet — no assets/liabilities/equity module
- Trial Balance — no double-entry ledger
- General Ledger Report — no GL module (only credit sub-ledger)
- Journal Entries Report — no journal module
- Accounts Payable Report — no supplier payables module (Purchase Orders exist but no payable aging)
- Partner Ledger Report — no partner/vendor ledger
- Budget vs Actual Report — no budget module
- Cost Center Analysis Report — no cost-center dimension on expenses
- Fixed Assets Report — no fixed-assets register
- Depreciation Schedule Report — no depreciation engine

---

## 📌 Summary

| Status        | Count |
| ------------- | ----- |
| ✅ Available  | 17    |
| 🟡 Partial    | 4     |
| ❌ Missing    | 10    |

### ❌ Still Missing (require new modules)

**Accounting core (double-entry):**
1. Balance Sheet
2. Trial Balance
3. General Ledger
4. Journal Entries

**Payables / Vendors:**
5. Accounts Payable
6. Partner Ledger

**Planning & Controlling:**
7. Budget vs Actual
8. Cost Center Analysis

**Assets:**
9. Fixed Assets Register
10. Depreciation Schedule

### 🟡 Could be promoted to dedicated cards
- Payment Settlement Report (gateway settlement timeline)
- Payment Reconciliation Report (auto-match payments ↔ deposits)
- Accounts Receivable Aging (0-30/31-60/61-90/90+ buckets on credit ledger)
- Bank Reconciliation (import statement → match)

### 🛠️ Suggested next builds (highest ROI)
1. **A/R Aging Report** — extend `/credit-ledger` with aging buckets (small lift, big value)
2. **Accounts Payable + Supplier Ledger** — leverage existing `purchase_orders` + `suppliers`
3. **Budget vs Actual** — new `budgets` table keyed by category/month, compare to `expenses`/`orders`
4. **Double-entry GL module** — foundation for Balance Sheet, Trial Balance, Journal, GL (largest lift)
5. **Fixed Assets + Depreciation** — new `assets` table with SLM/WDV schedules
