# 📊 Complete Report Inventory

> Module-wise inventory of every report present (or derivable) in the POS software.
> Status legend: ✅ **Existing** • 🟡 **Partial** (data + page exist but limited/UI-only) • ❌ **Missing** • 💡 **Recommended** (derivable from existing data, not yet built)

Primary report surfaces:
- `/reports` — Reports hub (`src/pages/ReportsPage.tsx`)
- `/reports/more` — 8 quick reports (`src/pages/MoreReportsPage.tsx`)
- `/advanced-reports` — 18 analytics tabs (`src/pages/AdvancedReportsPage.tsx` + edge RPC functions)
- `/reports/*` — Petpooja-style summaries (`src/pages/reports/*`)
- `/cash-flow`, `/expenses`, `/credit-ledger`, `/withdrawal`, `/cash-topup`, `/attendance-reports`, `/admin/reports`

---

## 1. Sales Reports

- Daily Sales Report — ✅ (`/cash-flow` + `DailySalesReport.tsx`, today filter in `/reports`)
- Weekly Sales Report — ✅ (`/reports` time range = week)
- Monthly Sales Report — ✅ (`/reports` time range = month)
- Yearly Sales Report — 🟡 (date-range picker supports it; no dedicated card)
- Custom Date Range Sales — ✅ (`DatePickerWithRange` everywhere)
- Hourly Sales Report — ✅ (`/reports/more?r=hourly`, `useAdvancedReports → get_hourly_sales`)
- Day-wise Sales Report — ✅ (`/reports/more?r=hourly`)
- Sales Trend Report — ✅ (`/advanced-reports → salesTrend`, `get_sales_trends`)
- Sales Summary — ✅ (`/reports/sales`)
- Executive Sales Report — ✅ (`/reports/executive`)
- Category-wise Sales Report — ✅ (`/reports/category`)
- Item-wise Sales Report — ✅ (`/reports/item` and `/reports/more?r=item`)
- Item Performance / Top + Slow Movers — ✅ (`AdvancedReportTabs → ItemPerformanceReport`)
- Top Selling Items — ✅ (Item Performance top 10)
- Least Selling Items — ✅ (Item Performance slow movers)
- Group Summary Report — ✅ (`/reports/group`)
- Variation Summary Report — ✅ (`/reports/variation`)
- Cover Size Summary Report — ✅ (`/reports/cover-size`)
- Counter Summary Report — ✅ (`/reports/counter`)
- Order Summary Report — ✅ (`/reports/order`)
- Department-wise Sales Report — ❌ 💡 (no `department` field on products; derivable if categories are mapped to departments)
- Outlet-wise / Multi-Outlet Sales Report — ✅ (`AdvancedReportTabs → MultiOutletReport`, `get_multi_outlet_report`)
- Staff-wise Sales Report — ✅ (`/reports/more?r=staff`, `/reports/employee`)
- Customer-wise Sales Report — ✅ (`/reports/more?r=customer`)
- Payment Method Report — ✅ (`/reports/more?r=payment`, `get_payment_breakdown`)
- Tax / GST Report — ✅ (`/reports/more?r=tax`, `get_tax_report`)
- Discount Report — ✅ (`/reports/more?r=discount`, `get_discount_report`)
- Cancelled Bill Report — ✅ (Discount & Cancellation tab + cancelled list in `/reports`)
- Void Bill Report — 🟡 (void treated as cancelled; no separate "void vs cancel" split)
- Refund Report — ❌ 💡 (no refund flow yet; derivable once refund status is added to orders)
- Complimentary Report — 🟡 (complimentary tags visible in cart; no aggregated report)
- Hold Bill Report — 🟡 (held bills visible in POS; no historical report)
- Pending Bill Report — 🟡 (pending = unprinted/in-progress orders; surfaced in KOT, not a report)
- Average Bill Value (ABV) Report — ✅ (KPI on `/reports` + Multi-Outlet)
- Order Behavior Report — ✅ (`get_order_behavior`)
- Tip Summary Report — ✅ (`/reports/tip`)
- Profit Report (P&L) — ✅ (`/advanced-reports → pl`, `get_pl_report`)
- Margin Report — 🟡 (margin shown inside P&L category breakdown; no item-level margin report)
- Recipe Cost vs Sales Report — ❌ 💡 (recipes + sales exist locally; needs join report)
- Target vs Achievement Report — ✅ (`AdvancedReportTabs → TargetAchievementReport`, `get_target_achievement`)
- Loss Control Report — ✅ (`get_loss_control_report`)
- Bill Search / Bill History — ✅ (`/search-bill`)

---

## 2. Inventory Reports

- Stock Summary — ✅ (`InventoryView.tsx`)
- Current Stock — ✅ (`/inventory`)
- Stock Movement / History — ✅ (`src/lib/inventoryHistory.ts` — purchases, usage, production)
- Low Stock Report — ✅ (`/reports/more?r=inventory`, low-stock alerts in InventoryView)
- Out of Stock Report — 🟡 (filterable in InventoryView; no dedicated card)
- Negative Stock Report — ❌ 💡 (derivable from `quantity < 0`)
- Stock Valuation Report — ✅ (`/reports/more?r=inventory` shows stock value)
- Purchase vs Consumption Report — 🟡 (data captured in `inventoryHistory`; no chart yet)
- Recipe Consumption Report — 🟡 (deduction logged via `useInventoryDeduction`; no consolidated report)
- Wastage Report — ❌ 💡 (no wastage entry type; needs `wastage` history entry)
- Damage Report — ❌ 💡 (same as above)
- Expiry Report — ❌ 💡 (no expiry/batch fields on inventory items)
- Batch Report — ❌ 💡 (batch tracking not modelled)
- Production Report — 🟡 (`autoProductionUtils.ts` logs production; not surfaced as a report)
- Warehouse Stock Report — ❌ (no warehouse module)
- Transfer Report — ❌ (no inter-store transfer module)
- Stock Adjustment Report — 🟡 (`stock_adjustments` table exists with store scope; no UI report)
- Physical Stock Verification Report — ❌ 💡 (recommend a stock-take entry type)
- Inventory Aging Report — ❌ 💡 (derivable from `createdAt` + last movement)
- Smart Inventory Insights — ✅ (`/smart-inventory`, `SmartInventoryPage`)

---

## 3. Purchase Reports

- Purchase Orders List — ✅ (`/purchase-orders`, `PurchaseOrdersPage.tsx`)
- Purchase Register — 🟡 (PO list exists; no period-wise register)
- Supplier-wise Purchase Report — ❌ 💡 (suppliers table exists, joinable with POs)
- Item-wise Purchase Report — ❌ 💡 (derivable from PO line items)
- Pending Purchase Orders — 🟡 (status filter on PO page)
- Received vs Ordered Report — ❌ 💡
- Purchase Return Report — ❌ (no return flow)
- Purchase Payment / Outstanding Report — ❌ 💡

---

## 4. Customer Reports

- Customer Master List — ✅ (`/customers`, `CustomerManagement.tsx`)
- Customer Sales Report — ✅ (`/reports/more?r=customer`)
- Top Customers by Spend — ✅ (same)
- Customer Analytics — ✅ (`get_customer_analytics`)
- Customer Retention Report — ✅ (`AdvancedReportTabs → CustomerRetentionReport`, `get_customer_retention`)
- Churn Rate Report — ✅ (within Retention)
- Visit Frequency Report — ✅ (within Retention)
- New vs Repeat Customers — ✅ (within Retention)
- Customer Birthday/Anniversary Report — ❌ 💡 (fields not collected)
- Inactive Customers Report — ❌ 💡 (derivable from last-visit)

---

## 5. Credit Ledger Reports

- Credit Ledger / Due Payment — ✅ (`/credit-ledger`, `CreditLedger.tsx`)
- Outstanding Balances — ✅ (Invoice Report `get_invoice_report`)
- Credit Payments Received — ✅ (`credit_payments` table + `InvoiceReport`)
- Customer-wise Credit Outstanding — ✅ (Invoice Report)
- Paid / Partial / Unpaid Split — ✅ (Invoice Report pie)
- Credit Aging Report — ❌ 💡 (derivable from `credit_ledger.created_at`)
- Credit Limit Breach Report — ❌ 💡

---

## 6. Vendor / Supplier Reports

- Supplier Master — ✅ (`suppliers` table + UI)
- Supplier Outstanding — ❌ 💡
- Supplier Performance (delivery time, fill rate) — ❌ 💡
- Supplier-wise Purchase Spend — ❌ 💡

---

## 7. Kitchen (KOT) Reports

- KOT Listing — ✅ (`/kot-listing`, `KOTListingPage.tsx`)
- Kitchen Display — ✅ (`/kitchen`, `KitchenDisplayPage.tsx`)
- Kitchen Performance Report — ✅ (`AdvancedReportTabs → KitchenPerformanceReport`, `get_kitchen_performance`)
- Avg Order Preparation Time — ✅ (within Kitchen Performance)
- Completion / Cancellation Rate — ✅ (within Kitchen Performance)
- Item-wise Prep Time — ❌ 💡

---

## 8. Online Orders Reports

- Online Orders List — ✅ (`/online-orders`, `OnlineOrdersPage.tsx`)
- Channel-wise Sales (Zomato/Swiggy) — ❌ 💡 (orderType supports it; no breakdown report)
- Online vs Offline Comparison — ❌ 💡

---

## 9. QR Ordering Reports

- QR Orders Panel — ✅ (`/qr-orders`, `QROrdersPanel.tsx`)
- QR Order Conversion Report — ❌ 💡
- Table-wise QR Order Report — ❌ 💡

---

## 10. Delivery Reports

- Delivery Management — ✅ (`/delivery`, `DeliveryManagement.tsx`)
- Delivery Performance — ✅ (`AdvancedReportTabs → DeliveryPerformanceReport`, `get_delivery_performance`)
- Delivery Staff Performance — ✅ (within above)
- Avg Delivery Time — ✅ (within above)
- Completion Rate — ✅ (within above)
- Delivery Area / Zone Report — ❌ 💡

---

## 11. Tables Reports

- Tables Management — ✅ (`/tables`, `TablesManagementPage.tsx`)
- Table Status (Vacant/Occupied/Reserved/Billed) — ✅ (in POS billing sheet)
- Table Performance Report — ✅ (`get_table_performance`)
- Table Turnover / Occupancy — 🟡 (data in `get_table_performance`; no dedicated card)
- Reservation Report — ❌ 💡 (reservations captured locally; no report)

---

## 12. Staff & Attendance Reports

- Attendance Report — ✅ (`/attendance-reports`)
- Daily / Monthly Attendance — ✅
- Late Arrivals Report — 🟡 (data captured; flag visible, no aggregate)
- Overtime Report — ✅ (`OvertimeReport.tsx`)
- Staff Performance Report — ✅ (`/reports/more?r=staff`)
- Employee Summary — ✅ (`/reports/employee`)
- Workforce Analytics — ✅ (`/workforce-analytics`)
- Staff Sales Leaderboard — ✅ (within Staff Performance)
- Leave Report — 🟡 (`/leave-request` exists; no aggregated report)
- Advance Request Report — 🟡 (`/advance-request` exists)

---

## 13. Payroll Reports

- Payroll Summary — ❌ 💡 (overtime + hourly rate exist in OvertimeReport; full payroll missing)
- Salary Slip / Payslip — ❌
- Deductions Report — ❌
- PF / ESI Statutory Report — ❌

---

## 14. CRM Reports

- Customer Engagement — 🟡 (covered by Customer Retention)
- Communication / Notifications Log — ❌ 💡

---

## 15. Checklist Reports

- Opening/Closing Checklist — ❌ (no checklist module)

---

## 16. Expense Reports

- Expense Tracker — ✅ (`/expenses`, `ExpenseTracker.tsx`)
- Expense by Category — 🟡 (category supported in `expenses` table; needs chart)
- Expense by Date / Period — ✅ (filterable in ExpenseTracker)
- Expense vs Revenue — ✅ (inside P&L report)

---

## 17. Finance / Cash Reports

- Cash Flow Report — ✅ (`/cash-flow`)
- Daily Sales (DSR) — ✅ (`DailySalesReport.tsx`)
- Cash Top-Up — ✅ (`/cash-topup`)
- Withdrawal Report — ✅ (`/withdrawal`)
- Cash Session / Drawer Report — 🟡 (`cash_sessions` table exists with store scope; no report UI)
- Bank Deposit Report — ❌ 💡
- Profit & Loss — ✅ (`/advanced-reports → pl`)
- Admin Financial Analytics — ✅ (`/admin/finance`)

---

## 18. GST & Taxation Reports

- GST Report (CGST/SGST split) — ✅ (`/reports/more?r=tax`)
- HSN-wise Tax Report — ❌ 💡 (HSN field exists on products; not aggregated)
- GSTR-1 / GSTR-3B Export — ❌ 💡
- B2B vs B2C Sales — ❌ 💡
- Tax Engine — ✅ (`/tax-engine`, configuration only)

---

## 19. Loyalty & Rewards Reports

- Loyalty Points Earned/Redeemed — ❌ (no loyalty module live)
- Reward Redemption Report — ❌

---

## 20. Coupons & Promotions Reports

- Coupon Usage Report — ❌ 💡 (discount captured; coupon code not stored)
- Promotion Effectiveness — ❌ 💡

---

## 21. Membership Reports

- Membership Sales / Renewals — ❌ (no membership module)

---

## 22. Multi-Outlet Reports

- Outlet-wise Revenue — ✅ (`MultiOutletReport`)
- Outlet-wise Orders / AOV — ✅ (same)
- Outlet Comparison — ✅ (same)
- Store Management — ✅ (`/stores`, `StoreManagement.tsx`)
- Outlet Leaderboard — 🟡 (sortable in MultiOutletReport)

---

## 23. Warehouse Reports

- Warehouse Stock — ❌ (no warehouse module)
- Warehouse Transfer — ❌

---

## 24. Production Reports

- Auto-Production Log — 🟡 (logged via `autoProductionUtils.ts` into `inventoryHistory`; no report)
- Production Yield Report — ❌ 💡
- Production vs Demand — ❌ 💡

---

## 25. Manufacturing Reports

- BOM Consumption — ❌ (covered partially by Recipe Consumption)
- WIP Report — ❌

---

## 26. Recipe Reports

- Recipe List — ✅ (Recipes inside `/inventory`)
- Recipe Cost Report — 🟡 (cost fields exist; no consolidated report)
- Recipe Profitability — ❌ 💡 (joins recipe cost with item sale price)

---

## 27. Audit Logs

- Audit Log — ✅ (`auditLogger.ts`, `/admin/audit` AuditSecurityPage)
- Sensitive Action Log (cancellations, password resets) — ✅ (logged via auditLogger)
- Data Change Log — 🟡

---

## 28. User Activity Reports

- User Activity Timeline — 🟡 (audit log entries; no dedicated user-activity view)
- Action Frequency / Heatmap — ❌ 💡

---

## 29. Login History

- Login History — 🟡 (Auth login events captured in Lovable Cloud auth logs; no in-app report)
- Failed Login Attempts — ❌ 💡

---

## 30. Device Activity Reports

- Device / Session List — 🟡 (sessions exist in `session.ts`; no report)
- Multi-Device Sync Log — 🟡 (sync queue logs; not exposed)

---

## 31. Integration Reports

- Integration Status — 🟡 (`/api-management`)
- API Usage Report — ❌ 💡
- Webhook Delivery Report — ❌

---

## 32. Marketplace / Addons Reports

- Addons Marketplace — ✅ (`/addons`, `AddonsMarketplacePage.tsx`)
- Addon Adoption Report (admin) — ✅ (`/admin/addons-management`)
- Per-Merchant Addon Usage — 🟡

---

## 33. Subscription & Billing Reports

- Subscription Management — ✅ (`/admin/subscriptions`)
- Subscription Requests — ✅ (admin Subscription Requests page)
- MRR / ARR Report — 🟡 (visible inside `/admin/finance`)
- Churn / Upgrade / Downgrade — ❌ 💡
- Invoice/Receipt History — ❌ 💡
- Plan Usage vs Limit — 🟡 (within `useSubscription`; no report)

---

## 34. Dashboard Analytics

- POS Dashboard — ✅ (`/dashboard`, `DashboardPage.tsx`)
- Executive Dashboard (Merchant) — ✅ (`/executive-dashboard`)
- Executive Dashboard (Admin) — ✅ (`/admin/dashboard`)
- Revenue Forecast — ✅ (`/revenue-forecast`)
- AI Insights — ✅ (`/ai-control-center`, `/admin/ai-insights`)
- Compliance Dashboard — ✅ (`/compliance`)
- System Analytics — ✅ (`/admin/system`)
- Customer Analytics (Admin) — ✅ (`/admin/customers`)
- Staff Analytics (Admin) — ✅ (`/admin/staff`)
- Inventory Analytics (Admin) — ✅ (`/admin/inventory-analytics` — file present)
- Product Analytics (Admin) — ✅ (`/admin/product-analytics` — file present)

---

## 📌 Summary

| Status | Count (approx) |
|---|---|
| ✅ Existing | ~95 |
| 🟡 Partial | ~30 |
| ❌ Missing | ~25 |
| 💡 Recommended (derivable) | ~30 |

### High-priority Recommended Reports (data already present, build cost low)

1. **Recipe Cost vs Sales Report** — join recipes + order items
2. **Wastage / Damage / Expiry Report** — add entry type to `inventoryHistory`
3. **Cash Session / Drawer Report** — `cash_sessions` table already store-scoped
4. **Stock Adjustment Report** — `stock_adjustments` table already exists
5. **HSN-wise GST + GSTR-1 export** — HSN field already on products
6. **Credit Aging Buckets (0-30/30-60/60-90/90+)** — from `credit_ledger.created_at`
7. **Supplier-wise Purchase + Outstanding** — `suppliers` + `purchase_orders` already linked
8. **Coupon / Promotion Effectiveness** — needs coupon code column on orders
9. **Channel-wise Online Sales (Zomato/Swiggy/Own)** — already in `orderType`
10. **Login History + Failed Attempts** — sourced from auth logs

