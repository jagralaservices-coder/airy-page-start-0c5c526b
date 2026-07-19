// Phase 2 helpers — derivation utilities on top of inventory history + inventory snapshot.
import { InventoryItem } from '@/lib/store';
import { InventoryHistoryEntry } from '@/lib/inventoryHistory';
import { DateRange } from 'react-day-picker';

// Net movement for an item across a time window: (in − out) applied on top of a snapshot.
// Convention: 'purchase' & 'production' are IN, 'usage' is OUT.
export const netMovement = (entries: InventoryHistoryEntry[], from: number, to: number, inventoryId?: string) => {
  let net = 0;
  for (const h of entries) {
    if (inventoryId && h.inventoryId !== inventoryId) continue;
    const t = new Date(h.createdAt).getTime();
    if (t < from || t > to) continue;
    const q = Math.abs(h.quantity);
    net += (h.type === 'usage') ? -q : q;
  }
  return net;
};

// Opening stock at `from` (inclusive) = currentQty − netMovement(from…now)
export const openingStockAt = (item: InventoryItem, entries: InventoryHistoryEntry[], from: number, now = Date.now()) => {
  const net = netMovement(entries, from, now, item.id);
  return item.quantity - net;
};

// Closing stock at `to` (inclusive) = currentQty − netMovement((to, now])
export const closingStockAt = (item: InventoryItem, entries: InventoryHistoryEntry[], to: number, now = Date.now()) => {
  const net = netMovement(entries, to + 1, now, item.id);
  return item.quantity - net;
};

export const rangeBounds = (r: DateRange | undefined) => ({
  from: r?.from ? new Date(r.from).setHours(0, 0, 0, 0) : 0,
  to: r?.to ? new Date(r.to).setHours(23, 59, 59, 999) : (r?.from ? new Date(r.from).setHours(23, 59, 59, 999) : Date.now()),
});

// Average consumption per day over a range.
export const avgDailyConsumption = (entries: InventoryHistoryEntry[], inventoryId: string, from: number, to: number) => {
  const days = Math.max(1, Math.round((to - from) / 86400000));
  let used = 0;
  for (const h of entries) {
    if (h.inventoryId !== inventoryId || h.type !== 'usage') continue;
    const t = new Date(h.createdAt).getTime();
    if (t >= from && t <= to) used += Math.abs(h.quantity);
  }
  return used / days;
};

// Standard deviation of monthly demand — for XYZ analysis.
export const monthlyDemandStats = (entries: InventoryHistoryEntry[], inventoryId: string, months = 6) => {
  const now = new Date();
  const buckets: number[] = new Array(months).fill(0);
  for (const h of entries) {
    if (h.inventoryId !== inventoryId || h.type !== 'usage') continue;
    const d = new Date(h.createdAt);
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (idx >= 0 && idx < months) buckets[idx] += Math.abs(h.quantity);
  }
  const mean = buckets.reduce((s, v) => s + v, 0) / months;
  const variance = buckets.reduce((s, v) => s + (v - mean) ** 2, 0) / months;
  const std = Math.sqrt(variance);
  const cov = mean > 0 ? std / mean : 0; // coefficient of variation
  // trend: slope of simple linear regression across the last `months` (oldest→newest)
  const series = [...buckets].reverse();
  const n = series.length;
  const sumX = n * (n - 1) / 2;
  const sumY = series.reduce((s, v) => s + v, 0);
  const sumXY = series.reduce((s, v, i) => s + v * i, 0);
  const sumXX = series.reduce((s, _v, i) => s + i * i, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom > 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  return { mean, std, cov, buckets: series, slope };
};

// Last dates by type for an item.
export const lastDatesFor = (entries: InventoryHistoryEntry[], inventoryId: string) => {
  let lastAny: string | null = null, lastSale: string | null = null, lastPurchase: string | null = null, lastProd: string | null = null;
  for (const h of entries) {
    if (h.inventoryId !== inventoryId) continue;
    if (!lastAny || h.createdAt > lastAny) lastAny = h.createdAt;
    if (h.type === 'usage' && (!lastSale || h.createdAt > lastSale)) lastSale = h.createdAt;
    if (h.type === 'purchase' && (!lastPurchase || h.createdAt > lastPurchase)) lastPurchase = h.createdAt;
    if (h.type === 'production' && (!lastProd || h.createdAt > lastProd)) lastProd = h.createdAt;
  }
  return { lastAny, lastSale, lastPurchase, lastProd };
};

export const daysSince = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

export const bucketAge = (days: number | null): '0-30' | '31-60' | '61-90' | '91-180' | '180+' | 'never' => {
  if (days === null) return 'never';
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 180) return '91-180';
  return '180+';
};
