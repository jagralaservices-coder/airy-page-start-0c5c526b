# 📊 Sales Reports — Availability Checklist (Re-verified)

> Re-audit run after Quotation, Sales Return, Brand, Forecast & Comparison modules shipped.

---

## ⏱️ Time-Based Reports

**✅ Available**
- Daily Sales — `/cash-flow`, `DailySalesReport.tsx`, `/reports` (today)
- Hourly Sales — `/reports/more?r=hourly`, `get_hourly_sales`
- Weekly Sales — `/reports` (week range)
- Monthly Sales — `/reports` (month range)
- Sales Trend — `/advanced-reports → salesTrend`, `get_sales_trends`
- Revenue Trend — covered by Sales Trend + `/executive-dashboard`
- Peak Hours Analysis — Hourly Sales report highlights peaks
- **Sales Forecast — `/reports/forecast` (ForecastReportsPage, AI-driven)** ✅ NEW
- **Sales Comparison (period vs period) — `/reports/sales-comparison`** ✅ NEW

**🟡 Partial / Derivable**
- Yearly Sales — supported via custom date range, no dedicated card

**❌ Not Available**
- (none)

---

## 💰 Revenue & Financial Reports

**✅ Available**
- Sales Summary — `/reports/sales`
- Revenue Report — `/reports`, `/executive-dashboard`
- Revenue Analysis — `/advanced-reports`, `/admin/finance`
- Tax Summary — `/reports/more?r=tax`, `get_tax_report`
- Discount Summary — `/reports/more?r=discount`, `get_discount_report`
- Average Bill Value (AOV) — KPI on `/reports` + Multi-Outlet report
- Profit Margin Report — `/advanced-reports → pl`, `get_pl_report`

**🟡 Partial / Derivable**
- Gross Sales — KPI on `/reports`, no dedicated card
- Net Sales — KPI on `/reports`, no dedicated card
- Gross Margin Analysis — inside P&L category breakdown

**❌ Not Available**
- (none)

---

## 📦 Product & Category Reports

**✅ Available**
- Product-wise Sales — `/reports/item`, `/reports/more?r=item`
- Item-wise Sales — same as above
- Category-wise Sales — `/reports/category`
- Product Performance Report — `AdvancedReportTabs → ItemPerformanceReport`
- **Brand-wise Sales — `/reports/brand-sales` + Brand Master at `/inventory/brands`** ✅ NEW

**🟡 Partial / Derivable**
- (none)

**❌ Not Available**
- (none)

---

## 👥 Customer Reports

**✅ Available**
- Customer-wise Sales — `/reports/more?r=customer`
- Customer Purchase Analysis — `get_customer_analytics`, Customer Retention report
- **Customer 360° Profile — `/customers/:id`** ✅ NEW

**🟡 Partial / Derivable**
- Customer Order History — visible inside `/customers` detail; no standalone report card

**❌ Not Available**
- (none)

---

## 🏪 Outlet & Location Reports

**✅ Available**
- Outlet-wise Sales — `/reports/outlets` (owner-only)
- Branch-wise Sales — `/reports/outlets` → Branches tab
- Region-wise Sales — `/reports/outlets` → Regions tab (location fields on `stores`)
- Outlet Dashboard / Cross-Outlet Comparison — `/reports/outlets/:storeId` + Comparison tab
- Counter-wise Sales — `/reports/counter` and `/reports/outlets` → Counters tab

**🟡 Partial / Derivable**
- (none)

**❌ Not Available**
- (none)

---

## 👤 Employee Reports

**✅ Available**
- Salesperson Performance — `/reports/employee`, `AdvancedReportTabs → StaffPerformance`
- Salesperson-wise Sales — `/reports/more?r=staff`
- **Employee Dashboard — `/reports/employee/:id`** ✅ NEW
- **Cashier Performance — Cashier Billing module audit logs** ✅ NEW

**🟡 Partial / Derivable**
- (none)

**❌ Not Available**
- (none)

---

## 🧾 Order & Billing Reports

**✅ Available**
- Bill-wise Sales — `/search-bill`, `/reports/order`
- Order Statistics — `/reports/order`, `get_order_behavior`
- Sales Order Report — `/reports/order`
- **Sales Return Report — `/reports/sales-returns` + `/returns` (Return/Refund Center)** ✅ NEW
- **Quotation Report — `/reports/quotations` + `/quotations` (toggle-gated)** ✅ NEW

**🟡 Partial / Derivable**
- (none)

**❌ Not Available**
- Back Order Report — no back-order module
- Sales Pipeline Report — no CRM pipeline module

---

## 📈 Business Performance Reports

**✅ Available**
- Sales Analysis Report — `/advanced-reports` (multiple analysis tabs)
- Revenue Forecast — `/revenue-forecast`
- **Forecast Reports (AI insights) — `/reports/forecast`** ✅ NEW
- **Sales Comparison — `/reports/sales-comparison`** ✅ NEW

**🟡 Partial / Derivable**
- (none)

**❌ Not Available**
- Sales Pipeline Report — no CRM pipeline module

---

## 📌 Summary

| Status        | Count |
| ------------- | ----- |
| ✅ Available  | 36    |
| 🟡 Partial    | 4     |
| ❌ Missing    | 2     |

### ✅ Shipped since last audit
1. **Sales Comparison** — `/reports/sales-comparison`
2. **Sales Return Report + Return/Refund Center** — `/reports/sales-returns`, `/returns`
3. **Brand-wise Sales + Brand Master** — `/reports/brand-sales`, `/inventory/brands`
4. **Region-wise Sales** — `/reports/outlets → Regions`
5. **Quotation Module + Report** — `/quotations`, `/reports/quotations` (toggle in Settings → Feature Toggles)
6. **Forecast Reports (AI)** — `/reports/forecast`
7. **Customer 360° Profile**, **Employee Dashboard**, **Cashier Performance**

### ❌ Still Missing
1. **Back Order Report** — requires back-order/pre-order module
2. **Sales Pipeline Report** — requires CRM pipeline module

### 🟡 Could be promoted to dedicated cards
- Yearly Sales (date-range only)
- Gross Sales / Net Sales (currently KPIs)
- Gross Margin Analysis (inside P&L)
- Standalone Customer Order History report
