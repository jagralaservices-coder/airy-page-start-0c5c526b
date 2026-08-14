// Enterprise Audit & Stock Reconciliation Calculation Engine
// Integrates Inventory, POS Billing, Recipe Deductions, Purchases, Wastage, & Inter-Outlet Transfers.

import { getInventory, getOrders, getExpenses, InventoryItem, Order } from '@/lib/store';
import { ClosingAuditItem, getOpeningAudits, getAuditConfig } from '@/lib/checklists/inventoryAuditStore';
import { fmtINR } from '@/lib/reportCsvUtils';

export interface AuditMovementFilter {
  storeId?: string;
  fromDate?: Date;
  toDate?: Date;
}

// Compute complete stock movements & expected closing stock per product
export const computeReconciliationItems = (
  inventory: InventoryItem[],
  orders: Order[],
  filter?: AuditMovementFilter
): ClosingAuditItem[] => {
  const config = getAuditConfig();
  const fromTime = filter?.fromDate ? new Date(filter.fromDate).setHours(0, 0, 0, 0) : 0;
  const toTime = filter?.toDate ? new Date(filter.toDate).setHours(23, 59, 59, 999) : Date.now();

  // Filter orders in timeframe
  const periodOrders = orders.filter((o) => {
    if (o.status === 'cancelled') return false;
    const t = new Date(o.createdAt).getTime();
    return t >= fromTime && t <= toTime;
  });

  // Fetch today's or latest Opening Audit for baseline stock
  const openingAudits = getOpeningAudits();
  const latestOpening = openingAudits.length > 0 ? openingAudits[0] : null;
  const openingStockMap = new Map<string, number>();

  if (latestOpening && latestOpening.items) {
    latestOpening.items.forEach((item) => {
      openingStockMap.set(String(item.productId), Number(item.openingQty) || 0);
    });
  }

  // Map for tracking sales (direct + recipe ingredient deductions)
  const salesMap = new Map<string, number>();

  periodOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const soldQty = Number(item.quantity) || 0;

      // 1. Direct Inventory deduction if item is linked directly
      const directId = String(item.id || item.name);
      salesMap.set(directId, (salesMap.get(directId) || 0) + soldQty);

      // 2. Recipe Ingredient Deduction (Issue 6)
      const recipeIngredients = (item as any).ingredients || (item as any).recipe || [];
      if (Array.isArray(recipeIngredients) && recipeIngredients.length > 0) {
        recipeIngredients.forEach((ing: any) => {
          const ingId = String(ing.inventoryItemId || ing.id || ing.name);
          const ingDeduction = (Number(ing.quantity) || 1) * soldQty;
          salesMap.set(ingId, (salesMap.get(ingId) || 0) + ingDeduction);
        });
      }
    });
  });

  // Calculate per-product audit row
  return inventory.map((product) => {
    const pId = String(product.id);
    const pName = product.name || 'Unnamed Product';
    const pSku = product.sku || `SKU-${pId.slice(0, 6)}`;
    const pBarcode = (product as any).barcode || `BAR-${pId.slice(0, 6)}`;
    const pCategory = product.category || 'General';
    const pUnit = product.unit || 'Pcs';
    const netWeight = (product as any).netWeight || (product as any).weight || 1;
    const costPrice = product.costPerUnit || product.price || 0;
    const sellingPrice = product.price || costPrice;

    // Baseline opening stock
    const openingStock = openingStockMap.has(pId)
      ? openingStockMap.get(pId)!
      : Number(product.quantity) || 0;

    // Direct & Recipe Deducted Sold Qty
    const soldQty = salesMap.get(pId) || salesMap.get(pName) || 0;

    // Purchases, Returns, Wastage, Transfers (Simulated/Read from logs)
    const purchasedQty = (product as any).purchasedQty || 0;
    const returnedQty = (product as any).returnedQty || 0;
    const wastageQty = (product as any).wastageQty || (product as any).wasteQty || 0;
    const damagedQty = (product as any).damagedQty || 0;
    const transferInQty = (product as any).transferInQty || 0;
    const transferOutQty = (product as any).transferOutQty || 0;

    // Formula: Opening + Purchase + TransferIn - Sold - Returned - Wastage - TransferOut
    const expectedClosingStock = Math.max(
      0,
      openingStock + purchasedQty + transferInQty - soldQty - returnedQty - wastageQty - damagedQty - transferOutQty
    );

    // Initial physical count defaults to expected stock
    const physicalCount = expectedClosingStock;
    const difference = physicalCount - expectedClosingStock;
    const weightDifference = difference * netWeight;

    const baseForVariance = expectedClosingStock || 1;
    const variancePercent = Math.abs((difference / baseForVariance) * 100);

    let status: 'perfect' | 'small_diff' | 'large_diff' = 'perfect';
    if (Math.abs(difference) > 0) {
      if (variancePercent >= config.varianceThresholdPercent) {
        status = 'large_diff';
      } else {
        status = 'small_diff';
      }
    }

    const inventoryLoss = difference < 0 ? Math.abs(difference) * costPrice : 0;
    const inventoryProfit = difference > 0 ? difference * costPrice : 0;

    return {
      productId: pId,
      productName: pName,
      sku: pSku,
      barcode: pBarcode,
      category: pCategory,
      unit: pUnit,
      netWeight,
      costPrice,
      sellingPrice,
      openingStock,
      purchasedQty,
      returnedQty,
      soldQty,
      wastageQty,
      damagedQty,
      transferInQty,
      transferOutQty,
      expectedClosingStock,
      physicalCount,
      difference,
      weightDifference,
      variancePercent,
      status,
      inventoryLoss,
      inventoryProfit,
    };
  });
};

// Summary metrics helper
export const computeAuditSummary = (items: ClosingAuditItem[]) => {
  const openingValue = items.reduce((sum, i) => sum + i.openingStock * i.costPrice, 0);
  const closingValue = items.reduce((sum, i) => sum + i.physicalCount * i.costPrice, 0);
  const totalSalesQty = items.reduce((sum, i) => sum + i.soldQty, 0);
  const totalSalesValue = items.reduce((sum, i) => sum + i.soldQty * i.sellingPrice, 0);
  const totalPurchaseQty = items.reduce((sum, i) => sum + i.purchasedQty, 0);
  const totalWastageQty = items.reduce((sum, i) => sum + i.wastageQty + i.damagedQty, 0);
  const totalWastageValue = items.reduce((sum, i) => sum + (i.wastageQty + i.damagedQty) * i.costPrice, 0);
  const totalStockDifference = items.reduce((sum, i) => sum + i.difference, 0);
  const totalInventoryLoss = items.reduce((sum, i) => sum + i.inventoryLoss, 0);
  const totalInventoryProfit = items.reduce((sum, i) => sum + i.inventoryProfit, 0);

  const productsWithVariance = items.filter((i) => Math.abs(i.difference) > 0).length;
  const outOfStockProducts = items.filter((i) => i.physicalCount <= 0).length;
  const lowStockProducts = items.filter((i) => i.physicalCount > 0 && i.physicalCount <= 5).length;

  return {
    openingValue,
    closingValue,
    totalSalesQty,
    totalSalesValue,
    totalPurchaseQty,
    totalWastageQty,
    totalWastageValue,
    totalStockDifference,
    totalInventoryLoss,
    totalInventoryProfit,
    productsWithVariance,
    outOfStockProducts,
    lowStockProducts,
  };
};
