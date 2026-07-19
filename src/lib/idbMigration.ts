// One-time migration: copy existing localStorage business data into IndexedDB.
// Also re-hydrates localStorage from IndexedDB if storage was cleared while
// IndexedDB still has the data — making IDB the durable source of truth.

import { bulkPutRecords, CoreTable, getAllRecords, metaGet, metaSet } from './idb';

const MIGRATION_FLAG = 'localStorage_to_idb_v1';

// localStorage base keys mirror STORAGE_KEYS in store.ts
const KEY_MAP: { table: CoreTable; baseKey: string; scoped: boolean }[] = [
  { table: 'orders',        baseKey: 'pos_orders',         scoped: true },
  { table: 'credit_ledger', baseKey: 'pos_credit_ledger',  scoped: true },
  { table: 'customers',     baseKey: 'pos_customers',      scoped: true },
  { table: 'menu_items',    baseKey: 'pos_menu_items',     scoped: true },
  { table: 'inventory',     baseKey: 'pos_inventory',      scoped: true },
];

const readJSON = (k: string): any => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJSON = (k: string, v: any) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

const extractStoreId = (scopedKey: string, baseKey: string): string => {
  if (scopedKey === baseKey) return '';
  return scopedKey.slice(baseKey.length + 1); // baseKey_<storeId>
};

// Step 1: copy every scoped localStorage payload for the 5 core tables into IDB.
const copyLocalStorageToIDB = async (): Promise<void> => {
  for (const { table, baseKey, scoped } of KEY_MAP) {
    const matchingKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === baseKey || (scoped && k.startsWith(baseKey + '_'))) {
        matchingKeys.push(k);
      }
    }
    for (const k of matchingKeys) {
      const items = readJSON(k);
      if (!Array.isArray(items) || items.length === 0) continue;
      const storeId = extractStoreId(k, baseKey);
      const rows = items
        .filter(i => i && i.id != null)
        .map(i => ({
          id: String(i.id),
          store_id: storeId || String(i.store_id || i.storeId || ''),
          data: i,
          updated_at: i.lastUpdated || i.updated_at || i.created_at || new Date().toISOString(),
        }));
      try {
        await bulkPutRecords(table, rows);
        console.log(`[IDB] Migrated ${rows.length} ${table} from ${k}`);
      } catch (e) {
        console.error(`[IDB] Migration failed for ${k}:`, e);
      }
    }
  }
};

// Step 2: if a scoped localStorage key is missing/empty but IDB has rows for that
// (table, store_id) combo, restore localStorage from IDB. Protects against
// devtools "clear site data", quota eviction, etc.
export const hydrateLocalStorageFromIDB = async (): Promise<void> => {
  for (const { table, baseKey } of KEY_MAP) {
    const all = await getAllRecords(table);
    if (!all.length) continue;
    const byStore = new Map<string, any[]>();
    for (const row of all) {
      if (row.deleted) continue;
      const sid = row.store_id || '';
      if (!byStore.has(sid)) byStore.set(sid, []);
      byStore.get(sid)!.push(row.data);
    }
    for (const [sid, items] of byStore.entries()) {
      const lsKey = sid ? `${baseKey}_${sid}` : baseKey;
      const existing = readJSON(lsKey);
      if (!Array.isArray(existing) || existing.length === 0) {
        writeJSON(lsKey, items);
        console.log(`[IDB] Restored ${items.length} ${table} to localStorage[${lsKey}]`);
      }
    }
  }
};

export const runIDBMigration = async (): Promise<void> => {
  try {
    const done = await metaGet<boolean>(MIGRATION_FLAG);
    if (!done) {
      console.log('[IDB] Running first-time localStorage → IndexedDB migration…');
      await copyLocalStorageToIDB();
      await metaSet(MIGRATION_FLAG, true);
      console.log('[IDB] Initial migration complete.');
    }
    // Always run hydration — cheap and protects against cleared localStorage.
    await hydrateLocalStorageFromIDB();
  } catch (e) {
    console.error('[IDB] Migration error:', e);
  }
};
