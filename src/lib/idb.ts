// Phase 1 Offline-First — IndexedDB layer (Dexie)
// Durable local database for core POS business data + persistent sync queue.
// Synchronous localStorage getters in store.ts remain the hot read path;
// this layer is the durable source of truth and survives localStorage being cleared.

import Dexie, { Table } from 'dexie';

export type CoreTable =
  | 'orders'
  | 'credit_ledger'
  | 'customers'
  | 'menu_items'
  | 'inventory';

export const CORE_TABLES: CoreTable[] = [
  'orders',
  'credit_ledger',
  'customers',
  'menu_items',
  'inventory',
];

// Generic envelope stored in IndexedDB. The full record lives in `data`.
// store_id is denormalized so we can query/scope efficiently.
// Phase 2 adds organization_id / session_id / version_number / updated_by
// metadata directly to the envelope (kept client-side; not sent to server).
export interface IDBRecord {
  id: string;            // record id
  store_id: string;      // scoping key (empty string if unscoped)
  table: CoreTable;
  data: any;             // the full record payload
  updated_at: string;    // ISO
  deleted?: 0 | 1;       // soft-delete flag (queue still pushes the delete)
  organization_id?: string; // = merchant_id
  session_id?: string;
  version_number?: number;
  updated_by?: string;
}

// Persistent sync queue. Items survive refresh/close/restart/logout.
// Only removed after server acknowledges success.
export type SyncOp = 'upsert' | 'delete';

export interface SyncQueueItem {
  id?: number;             // auto-increment
  table: CoreTable;
  op: SyncOp;
  record_id: string;
  store_id: string;
  payload: any;
  enqueued_at: string;     // ISO
  attempts: number;
  next_attempt_at: string; // ISO — for backoff
  last_error?: string;
  poisoned?: boolean;      // R2: permanent-failure flag
  organization_id?: string;
  session_id?: string;
  version_number?: number;
  updated_by?: string;
}

// Phase 2 — recorded conflicts for debugging + recovery.
export interface ConflictRow {
  id?: number;
  table: CoreTable;
  record_id: string;
  store_id: string;
  reason: string;          // human-readable rule that triggered
  local_version?: number;
  cloud_version?: number;
  local_updated_at?: string;
  cloud_updated_at?: string;
  local_updated_by?: string;
  cloud_updated_by?: string;
  local_snapshot: any;
  cloud_snapshot: any;
  resolution: 'kept_local' | 'kept_cloud' | 'merged';
  detected_at: string;
}

export interface MetaRow {
  key: string;
  value: any;
}

class POSDexie extends Dexie {
  orders!: Table<IDBRecord, string>;
  credit_ledger!: Table<IDBRecord, string>;
  customers!: Table<IDBRecord, string>;
  menu_items!: Table<IDBRecord, string>;
  inventory!: Table<IDBRecord, string>;
  sync_queue!: Table<SyncQueueItem, number>;
  conflicts!: Table<ConflictRow, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('pos_offline_v1');
    this.version(1).stores({
      orders:        'id, store_id, updated_at',
      credit_ledger: 'id, store_id, updated_at',
      customers:     'id, store_id, updated_at',
      menu_items:    'id, store_id, updated_at',
      inventory:     'id, store_id, updated_at',
      sync_queue:    '++id, table, store_id, record_id, next_attempt_at',
      meta:          'key',
    });
    // Phase 2 upgrade — add conflicts table. Existing records auto-migrate
    // (envelope fields are optional, default to undefined and are stamped
    // lazily on the next mutation).
    this.version(2).stores({
      orders:        'id, store_id, updated_at, version_number',
      credit_ledger: 'id, store_id, updated_at, version_number',
      customers:     'id, store_id, updated_at, version_number',
      menu_items:    'id, store_id, updated_at, version_number',
      inventory:     'id, store_id, updated_at, version_number',
      sync_queue:    '++id, table, store_id, record_id, next_attempt_at',
      conflicts:     '++id, table, record_id, detected_at',
      meta:          'key',
    });
  }
}

export const idb = new POSDexie();

export const tableFor = (name: CoreTable): Table<IDBRecord, string> => {
  return (idb as any)[name];
};

// ---- meta helpers ----
export const metaGet = async <T = any>(key: string): Promise<T | undefined> => {
  const row = await idb.meta.get(key);
  return row?.value as T | undefined;
};

export const metaSet = async (key: string, value: any): Promise<void> => {
  await idb.meta.put({ key, value });
};

// ---- bulk helpers ----
// Phase 3 — per-record diff. Skips records whose serialized data is
// identical to what's already in IDB to avoid pointless writes & realtime echo.
const stableStringify = (v: any): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
};

export const bulkPutRecords = async (
  table: CoreTable,
  records: { id: string; store_id: string; data: any; updated_at?: string }[],
): Promise<void> => {
  if (!records.length) return;
  const ids = records.map(r => String(r.id));
  const existing = await tableFor(table).bulkGet(ids);
  const existingByIdx = new Map<number, IDBRecord | undefined>();
  ids.forEach((_, i) => existingByIdx.set(i, existing[i]));

  const rows: IDBRecord[] = [];
  let skipped = 0;
  records.forEach((r, i) => {
    const prev = existingByIdx.get(i);
    if (prev && stableStringify(prev.data) === stableStringify(r.data)) {
      skipped++;
      return;
    }
    rows.push({
      id: String(r.id),
      store_id: r.store_id || '',
      table,
      data: r.data,
      updated_at: r.updated_at || new Date().toISOString(),
      // preserve existing envelope fields if any
      organization_id: prev?.organization_id,
      session_id: prev?.session_id,
      version_number: prev?.version_number,
      updated_by: prev?.updated_by,
    });
  });
  if (rows.length) await tableFor(table).bulkPut(rows);
  if (skipped > 0) {
    try {
      const prev = (await idb.meta.get('idb_skipped_writes'))?.value || 0;
      await idb.meta.put({ key: 'idb_skipped_writes', value: prev + skipped });
    } catch {}
  }
};

export const getRecordsByStore = async (
  table: CoreTable,
  storeId: string,
): Promise<any[]> => {
  const rows = await tableFor(table).where('store_id').equals(storeId || '').toArray();
  return rows.filter(r => !r.deleted).map(r => r.data);
};

export const getAllRecords = async (table: CoreTable): Promise<IDBRecord[]> => {
  return tableFor(table).toArray();
};
