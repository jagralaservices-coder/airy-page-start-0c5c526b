# 📦 Inventory & Purchase Reports — Coverage Checklist

> Honest audit against the current codebase (`src/pages/`, `src/lib/inventoryHistory.ts`, `src/pages/accounting/`, DB tables).
> Legend: ✅ **Existing** • 🟡 **Partial** (data present, UI limited/missing) • ❌ **Missing** • 💡 **Derivable** (data available, needs report UI)

---

## 📦 Inventory Reports (29)

| # | Report | Status | Where / Notes |
|---|---|---|---|
| 1 | Stock Summary | ✅ | `/inventory` (`InventoryView`) |
| 2 | Stock Ledger | 🟡 | `inventoryHistory.ts` logs movements; dedicated ledger UI missing |
| 3 | Stock Movement | ✅ | `inventoryHistory.ts` — purchase / usage / production |
| 4 | Opening Stock | ❌ 💡 | No period-start snapshot; derivable from history |
| 5 | Closing Stock | ❌ 💡 | Same — needs period snapshot |
| 6 | Inventory Valuation | ✅ | `/reports/more?r=inventory` |
| 7 | Stock Aging Report | ❌ 💡 | Derivable from `createdAt` + last movement |
| 8 | Dead Stock Report | ❌ 💡 | Derivable (no movement in N days) |
| 9 | Fast Moving Items | ✅ | Advanced Reports → Item Performance |
| 10 | Slow Moving Items | ✅ | Same tab |
| 11 | Reorder Level Report | 🟡 | Low-stock threshold on products; no report card |
| 12 | Safety Stock Report | ❌ | No `safety_stock` field |
| 13 | Low Stock Alert | ✅ | `/reports/more?r=inventory` |
| 14 | Stock Adjustment Report | 🟡 | `stock_adjustments` table exists (store-scoped); UI report missing |
| 15 | Physical Stock Verification | ❌ | No stock-take module |
| 16 | Cycle Count Report | ❌ | — |
| 17 | Batch Tracking Report | ❌ | No batch fields on stock |
| 18 | Serial Number Tracking | ❌ | No serial fields |
| 19 | Bin Location Report | ❌ | No bin/location column |
| 20 | Warehouse Stock Report | ❌ | No warehouse module |
| 21 | Warehouse Transfer Report | ❌ | No inter-store transfer module |
| 22 | Item Movement Report | ✅ | `inventoryHistory.ts` per-item filter |
| 23 | Inventory Forecast Report | 🟡 | `/forecast-reports` covers sales — inventory-specific missing |
| 24 | Stock Consumption Report | 🟡 | `inventoryHistory` (usage); no chart/aggregation |
| 25 | Recipe Consumption Report | 🟡 | `useInventoryDeduction` logs; no report UI |
| 26 | Food Cost Report | ❌ 💡 | Derivable — join recipe cost + order items |
| 27 | Wastage Report | ❌ | Needs new `wastage` entry type |
| 28 | Expiry Report | ❌ | No expiry / batch fields |
| 29 | Production Report | 🟡 | `autoProductionUtils.ts` logs; no report UI |

**Inventory tally:** ✅ 6 · 🟡 7 · ❌ 16

---

## 🛒 Purchase Reports (26)

| # | Report | Status | Where / Notes |
|---|---|---|---|
| 1 | Purchase Register | 🟡 | `/purchase-orders` list; no period-wise register |
| 2 | Purchase Order Report | ✅ | `/purchase-orders` |
| 3 | Purchase Report | 🟡 | PO list only; no aggregated report |
| 4 | Purchase Analysis Report | ❌ | — |
| 5 | Purchase Cost Analysis | ❌ | — |
| 6 | Purchase Comparison Report | ❌ | — |
| 7 | Vendor-wise Purchase Report | ❌ 💡 | Derivable — `suppliers` × `purchase_orders` |
| 8 | Vendor Purchase Report | ❌ 💡 | Same as above |
| 9 | Goods Received Note (GRN) | ❌ | No GRN module |
| 10 | Purchase Return Report | ❌ | No purchase-return flow |
| 11 | Vendor Ledger | ✅ | `/accounting/supplier-ledger` |
| 12 | Vendor Performance Report | ❌ | Needs delivery / fill-rate tracking |
| 13 | Vendor Bills Report | ✅ | `/accounting/ap` (`supplier_invoices`) |
| 14 | Outstanding Vendor Payment | ✅ | `/accounting/ap` (overdue tracking) |
| 15 | RFQ Analysis Report | ❌ | No RFQ module |
| 16 | Lead Time Analysis | ❌ | No delivery-date tracking |
| 17 | ABC Inventory Analysis | ❌ 💡 | Derivable from sales + valuation |
| 18 | XYZ Inventory Analysis | ❌ 💡 | Derivable from demand variability |
| 19 | Inventory Turnover Report | ❌ 💡 | Derivable — COGS ÷ avg inventory |
| 20 | Stock Reservation Report | ❌ | No reservation module |
| 21 | Stock Transfer History | ❌ | No transfer module |
| 22 | Supplier Fill Rate | ❌ | Needs ordered vs received tracking |
| 23 | Purchase Price Variance (PPV) | ❌ | Needs standard cost field |
| 24 | Landed Cost Analysis | ❌ | No freight / duty tracking |
| 25 | Inventory Shrinkage Report | ❌ | Needs physical count vs system |
| 26 | Overstock Analysis Report | ❌ 💡 | Derivable — stock > max threshold |

**Purchase tally:** ✅ 4 · 🟡 2 · ❌ 20

---

## 📊 Grand Total

| Status | Count | % |
|---|---|---|
| ✅ Fully Built | 10 / 55 | 18% |
| 🟡 Partial (data present, UI limited) | 9 / 55 | 16% |
| ❌ Missing | 36 / 55 | 66% |

**Effective coverage (full + partial): ~35%.**

---

## 🎯 Recommended Priority (Quick Wins)

Data already exists in DB / history — only report UI needed:

1. **Stock Adjustment Report** — `stock_adjustments` table already store-scoped
2. **Vendor-wise Purchase Report** — join `suppliers` + `purchase_orders`
3. **Purchase Register (period-wise)** — filter POs by date range
4. **Stock Aging / Dead Stock** — from `inventoryHistory` last-movement timestamp
5. **Recipe Consumption / Food Cost Report** — join recipes + order items
6. **Reorder Level Report** — low-stock threshold already on products
7. **Inventory Turnover** — COGS (from P&L) ÷ avg inventory
8. **ABC / XYZ Analysis** — sales + valuation available
9. **Overstock Analysis** — needs `max_stock` field addition
10. **Production Report** — `autoProductionUtils` already logs entries

## 🧱 Needs New Schema

- **Batch / Serial / Expiry tracking** — `batch_id`, `serial_no`, `expiry_date` on stock items
- **Warehouses & Transfers** — `warehouses`, `stock_transfers` tables
- **GRN & Purchase Returns** — `grn`, `purchase_returns` tables
- **Wastage / Damage** — new entry type in `inventoryHistory`
- **Landed Cost** — freight / duty / customs fields on PO
- **Physical Stock / Cycle Count** — `stock_takes` table
- **Safety Stock / Max Stock** — additional threshold fields on products
- **Vendor Performance / Lead Time** — expected vs actual delivery dates on PO
