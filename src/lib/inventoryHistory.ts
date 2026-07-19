// Inventory History — local log of purchases (stock added) and usage (stock consumed via orders / auto-production).
// Stored in localStorage, scoped per store. Pure UI/reporting feature; no server sync.

export type InventoryHistoryType = 'purchase' | 'usage' | 'production';

export interface InventoryHistoryEntry {
  id: string;
  type: InventoryHistoryType;
  storeId: string;
  inventoryId: string;
  inventoryName: string;
  quantity: number;        // in base unit (g/ml/pcs)
  unit: string;            // base unit
  // Purchase-specific
  costPerUnit?: number;
  totalCost?: number;
  costUnit?: string;
  source?: string;         // e.g. "New stock", "Stock adjustment", "Bulk upload"
  // Usage-specific
  menuItemId?: string;
  menuItemName?: string;
  menuItemQuantity?: number;     // how many of the menu item were sold
  orderId?: string;
  billNumber?: string;
  // Production-specific
  producedFrom?: { name: string; quantity: number; unit: string }[];
  createdAt: string;       // ISO
  createdBy?: string;
}

const KEY = (storeId: string) => `pos_inventory_history_${storeId || 'default'}`;
const MAX_ENTRIES = 2000; // cap log per store

const getActiveStoreId = (): string => {
  try {
    const direct = localStorage.getItem('owner_selected_store_id');
    if (direct) return direct;
    const data = localStorage.getItem('pos_active_store_data');
    if (data) return JSON.parse(data).id || '';
  } catch {}
  return '';
};

const readAll = (storeId: string): InventoryHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(KEY(storeId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const writeAll = (storeId: string, entries: InventoryHistoryEntry[]) => {
  try {
    const trimmed = entries.slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY(storeId), JSON.stringify(trimmed));
  } catch {}
};

const newId = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `ih_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const logInventoryHistory = (
  entry: Omit<InventoryHistoryEntry, 'id' | 'createdAt' | 'storeId'> & { storeId?: string },
): InventoryHistoryEntry => {
  const storeId = entry.storeId || getActiveStoreId();
  const full: InventoryHistoryEntry = {
    id: newId(),
    createdAt: new Date().toISOString(),
    storeId,
    ...entry,
  };
  const existing = readAll(storeId);
  writeAll(storeId, [full, ...existing]);
  return full;
};

export const getInventoryHistory = (
  filter?: { type?: InventoryHistoryType; inventoryId?: string; storeId?: string },
): InventoryHistoryEntry[] => {
  const storeId = filter?.storeId || getActiveStoreId();
  let rows = readAll(storeId);
  if (filter?.type) rows = rows.filter(r => r.type === filter.type);
  if (filter?.inventoryId) rows = rows.filter(r => r.inventoryId === filter.inventoryId);
  return rows;
};

export const clearInventoryHistory = (storeId?: string) => {
  const sid = storeId || getActiveStoreId();
  try { localStorage.removeItem(KEY(sid)); } catch {}
};
