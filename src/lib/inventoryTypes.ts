// Frontend-only categorization of inventory items into "raw_material" or "packaging".
// Stored in localStorage keyed by store id so it works without backend schema changes.
// "product" is not stored here — products are menu items with stock (see menu_items.stock).

export type InventoryKind = 'raw_material' | 'packaging';

const getStoreId = (): string | null => {
  try {
    const direct = localStorage.getItem('owner_selected_store_id');
    if (direct) return direct;
    const raw = localStorage.getItem('pos_active_store_data');
    if (raw) return JSON.parse(raw)?.id ?? null;
  } catch {}
  return null;
};

const keyFor = (storeId: string | null) => `pos_inventory_kinds_${storeId ?? 'default'}`;

const readMap = (): Record<string, InventoryKind> => {
  try {
    const raw = localStorage.getItem(keyFor(getStoreId()));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeMap = (map: Record<string, InventoryKind>) => {
  try {
    localStorage.setItem(keyFor(getStoreId()), JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('pos:inventory-kinds-updated'));
  } catch {}
};

export const getInventoryKind = (itemId: string): InventoryKind => {
  return readMap()[itemId] || 'raw_material';
};

export const getAllInventoryKinds = (): Record<string, InventoryKind> => readMap();

export const setInventoryKind = (itemId: string, kind: InventoryKind) => {
  const map = readMap();
  map[itemId] = kind;
  writeMap(map);
};

export const removeInventoryKind = (itemId: string) => {
  const map = readMap();
  delete map[itemId];
  writeMap(map);
};
