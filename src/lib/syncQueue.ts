// Offline sync queue helpers backed by the local IndexedDB (Dexie) store.
// Provides the read + control surface consumed by POSDataContext and the
// conflict-resolution layer.

import { idb, SyncQueueItem, CoreTable, SyncOp } from './idb';

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  poisoned: number;
}

/** All queued (non-poisoned) items for a given store. */
export const pendingForStore = async (storeId: string): Promise<SyncQueueItem[]> => {
  if (!storeId) return [];
  try {
    const rows = await idb.sync_queue.where('store_id').equals(storeId).toArray();
    return rows.filter(r => !r.poisoned);
  } catch {
    return [];
  }
};

/** Aggregate counts for badges / status panels. */
export const queueStats = async (): Promise<QueueStats> => {
  try {
    const rows = await idb.sync_queue.toArray();
    const now = Date.now();
    const poisoned = rows.filter(r => r.poisoned);
    const active = rows.filter(r => !r.poisoned);
    const processing = active.filter(r => (r.attempts || 0) > 0 && new Date(r.next_attempt_at).getTime() <= now);
    return {
      total: rows.length,
      pending: active.length,
      processing: processing.length,
      poisoned: poisoned.length,
    };
  } catch {
    return { total: 0, pending: 0, processing: 0, poisoned: 0 };
  }
};

/** Items that permanently failed and need manual intervention. */
export const listPoisoned = async (): Promise<SyncQueueItem[]> => {
  try {
    const rows = await idb.sync_queue.toArray();
    return rows.filter(r => r.poisoned);
  } catch {
    return [];
  }
};

/** Re-arm a poisoned item so the engine picks it up again. */
export const retryPoisoned = async (id: number): Promise<void> => {
  try {
    await idb.sync_queue.update(id, {
      poisoned: false,
      attempts: 0,
      last_error: undefined,
      next_attempt_at: new Date().toISOString(),
    });
  } catch {
    // ignore — queue is best-effort
  }
};

/** Permanently drop a poisoned item. */
export const discardPoisoned = async (id: number): Promise<void> => {
  try {
    await idb.sync_queue.delete(id);
  } catch {
    // ignore
  }
};

/** Enqueue a mutation for later sync. */
export const enqueue = async (item: {
  table: CoreTable;
  op: SyncOp;
  record_id: string;
  store_id: string;
  payload: any;
}): Promise<void> => {
  try {
    await idb.sync_queue.add({
      ...item,
      enqueued_at: new Date().toISOString(),
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    } as SyncQueueItem);
  } catch {
    // ignore
  }
};
