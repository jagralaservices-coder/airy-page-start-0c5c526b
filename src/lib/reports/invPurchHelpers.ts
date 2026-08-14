// Shared helpers for Inventory & Purchase reports (Phase 1)
// Pure read-only utilities. No new tables, no schema changes.

import { DateRange } from 'react-day-picker';
import { getInventoryHistory, InventoryHistoryEntry } from '@/lib/inventoryHistory';
import { getInventory, getMenuItems, InventoryItem, MenuItem, Order, storage } from '@/lib/store';

export const fmt = (v: number, digits = 2) =>
  Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '0';

export const fmtInt = (v: number) => Number.isFinite(v) ? v.toLocaleString('en-IN') : '0';

export const fmtINR = (v: number) => `₹${fmt(v)}`;

export const inRange = (iso: string, range?: DateRange) => {
  if (!range?.from) return true;
  const t = new Date(iso).getTime();
  const from = new Date(range.from).setHours(0, 0, 0, 0);
  const to = new Date(range.to ?? range.from).setHours(23, 59, 59, 999);
  return t >= from && t <= to;
};

export const daysBetween = (a: Date, b: Date) =>
  Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));

// Aggregate inventory history across all stores when no storeId is provided
// (e.g. owner viewing "All Stores"). Falls back to normal per-store read otherwise.
export const readInventoryHistory = (storeId?: string): InventoryHistoryEntry[] => {
  if (storeId) return getInventoryHistory({ storeId });
  
  // Aggregate: get stores that the user has access to, and read their history
  const stores = storage.get('pos_stores', []);
  if (Array.isArray(stores) && stores.length > 0) {
    const all: InventoryHistoryEntry[] = [];
    stores.forEach((s: any) => {
      if (s?.id) {
        const rows = storage.get(`pos_inventory_history_${s.id}`, []);
        if (Array.isArray(rows)) {
          all.push(...rows);
        }
      }
    });
    return all;
  }

  return getInventoryHistory();
};

// Aggregate inventory items across all store-scoped keys when the current
// scope has none — prevents empty reports for owners on "All Stores".
export const readInventory = (storeId?: string): InventoryItem[] => {
  if (storeId) {
    return storage.get(`pos_inventory_${storeId}`, []);
  }

  const primary = getInventory();
  if (primary.length > 0) return primary;

  // Aggregate: get stores that the user has access to, and read their inventories
  const stores = storage.get('pos_stores', []);
  if (Array.isArray(stores) && stores.length > 0) {
    const merged = new Map<string, InventoryItem>();
    stores.forEach((s: any) => {
      if (s?.id) {
        const rows = storage.get(`pos_inventory_${s.id}`, []);
        if (Array.isArray(rows)) {
          rows.forEach((r: InventoryItem) => {
            if (r?.id && !merged.has(r.id)) {
              merged.set(r.id, r);
            }
          });
        }
      }
    });
    return Array.from(merged.values());
  }

  return [];
};

export const readMenu = (): MenuItem[] => getMenuItems();

export const stockStatus = (current: number, min: number): 'critical' | 'low' | 'normal' => {
  if (current <= 0 || (min > 0 && current <= min * 0.5)) return 'critical';
  if (min > 0 && current <= min) return 'low';
  return 'normal';
};

export const orderInRange = (o: Order, range?: DateRange) => inRange(new Date(o.createdAt).toISOString(), range);
