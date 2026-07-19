// Persistent sync queue. Items survive refresh/close/restart/logout.
// An entry is only removed after the server acknowledges success, OR after it
// has been classified as permanently failing (poisoned) and surfaced to the UI.

import { idb, SyncQueueItem, CoreTable, SyncOp } from './idb';

const MAX_TRANSIENT_ATTEMPTS = 50;     // soft cap before we treat repeated transient errors as poison
const MAX_PERMANENT_ATTEMPTS = 3;      // permanent errors poison fast
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

const backoffMs = (attempts: number): number => {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempts));
  const jitter = exp * 0.2 * (Math.random() - 0.5) * 2;
  return Math.max(BASE_DELAY_MS, Math.floor(exp + jitter));
};

export interface EnqueueInput {
  table: CoreTable;
  op: SyncOp;
  record_id: string;
  store_id: string;
  payload: any;
}

// R3: every queued item must carry a real store_id. If the caller has none,
// we still persist the change to IDB (caller already did) but skip enqueueing
// and record the orphan for visibility. Once a store becomes active, callers
// will trigger fresh enqueues on the next mutation.
const ORPHAN_COUNTER_KEY = 'orphan_enqueue_count';

const recordOrphan = async (input: EnqueueInput) => {
  try {
    const cur = (await idb.meta.get(ORPHAN_COUNTER_KEY))?.value || 0;
    await idb.meta.put({ key: ORPHAN_COUNTER_KEY, value: cur + 1 });
    await idb.meta.put({
      key: `last_orphan_${input.table}_${input.record_id}`,
      value: { ...input, at: new Date().toISOString() },
    });
    const diag = {
      table: input.table,
      record_id: input.record_id,
      op: input.op,
      organization_id: (input as any).organization_id || null,
      session_id: (input as any).session_id || null,
      updated_by: (input as any).updated_by || null,
      owner_selected_store_id: localStorage.getItem('owner_selected_store_id'),
      pos_active_store: localStorage.getItem('pos_active_store'),
    };
    console.error('[SyncQueue] BLOCKED — no active store_id, cloud write skipped', diag);
    try {
      const { toast } = await import('sonner');
      toast.error('Cloud sync skipped — no active store selected.', {
        description: `${input.table}/${input.record_id} kept locally only.`,
        id: `orphan-${input.table}`,
      });
    } catch {}
  } catch {}
};

// Phase 3 — dedup: if an unflushed, non-poisoned upsert for the same
// (table, record_id, store_id) is already pending, replace its payload
// instead of adding a new row. Cuts API calls for rapid in-place edits.
export const enqueue = async (item: EnqueueInput): Promise<void> => {
  if (!item.store_id) {
    await recordOrphan(item);
    return;
  }
  const now = new Date().toISOString();

  if (item.op === 'upsert') {
    const existing = await idb.sync_queue
      .where('record_id').equals(String(item.record_id))
      .and(r => r.table === item.table && r.store_id === item.store_id && r.op === 'upsert' && !(r as any).poisoned)
      .first();
    if (existing?.id) {
      await idb.sync_queue.update(existing.id, {
        payload: item.payload,
        next_attempt_at: now,
      });
      return;
    }
  }

  const row: SyncQueueItem = {
    table: item.table,
    op: item.op,
    record_id: String(item.record_id),
    store_id: item.store_id,
    payload: item.payload,
    enqueued_at: now,
    attempts: 0,
    next_attempt_at: now,
  };
  await idb.sync_queue.add(row);
  notifyEnqueued([item.table]);
};

export const enqueueMany = async (items: EnqueueInput[]): Promise<void> => {
  if (!items.length) return;
  const valid: SyncQueueItem[] = [];
  const orphans: EnqueueInput[] = [];
  const now = new Date().toISOString();
  for (const i of items) {
    if (!i.store_id) { orphans.push(i); continue; }
    valid.push({
      table: i.table,
      op: i.op,
      record_id: String(i.record_id),
      store_id: i.store_id,
      payload: i.payload,
      enqueued_at: now,
      attempts: 0,
      next_attempt_at: now,
    });
  }
  if (valid.length) {
    await idb.sync_queue.bulkAdd(valid);
    notifyEnqueued(valid.map(v => v.table));
  }
  for (const o of orphans) await recordOrphan(o);
};

// Sync Latency Optimization — fire an in-tab event so SyncEngine can drain
// immediately instead of waiting for its 5s queueInterval tick.
function notifyEnqueued(tables: string[]) {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('pos:queue-enqueued', { detail: { tables } }));
  } catch {}
}

export const pendingCount = async (): Promise<number> => idb.sync_queue.count();

export const poisonedCount = async (): Promise<number> =>
  idb.sync_queue.filter(r => !!(r as any).poisoned).count();

export const pendingForStore = async (storeId: string): Promise<SyncQueueItem[]> => {
  if (!storeId) return [];
  const all = await idb.sync_queue.where('store_id').equals(storeId).toArray();
  const now = Date.now();
  return all
    .filter(r => !(r as any).poisoned)
    .filter(r => new Date(r.next_attempt_at).getTime() <= now)
    .sort((a, b) => a.enqueued_at.localeCompare(b.enqueued_at));
};

export const ackSuccess = async (id: number): Promise<void> => {
  await idb.sync_queue.delete(id);
};

// R2: classify errors. Returns true for permanent (do not waste retries).
export const isPermanentError = (err: any): boolean => {
  if (!err) return false;
  const code: string = err?.code || err?.error?.code || '';
  const status: number = err?.status || err?.statusCode || err?.error?.status || 0;
  const msg: string = (err?.message || err?.error?.message || String(err)).toLowerCase();

  // Phase 2.5 — server-detected version conflict (SQLSTATE 40001 from trigger).
  // Treated separately so it doesn't poison; see isVersionConflictError.
  if (code === '40001' || msg.includes('metadata_version_conflict')) return false;

  // Postgres SQLSTATE: 23xxx = integrity violation, 22xxx = data exception, 42xxx = syntax/access
  if (/^(22|23|42)/.test(code)) return true;
  // PostgREST RLS / not found / param errors
  if (code === 'PGRST301' || code === 'PGRST204' || code === 'PGRST116' && status === 406) return true;
  if (status === 400 || status === 401 || status === 403 || status === 404 ||
      status === 409 || status === 410 || status === 422) return true;

  if (msg.includes('violates row-level security')) return true;
  if (msg.includes('permission denied')) return true;
  if (msg.includes('violates not-null')) return true;
  if (msg.includes('violates foreign key')) return true;
  if (msg.includes('duplicate key value')) return true;
  if (msg.includes('invalid input syntax')) return true;
  if (msg.includes('column') && msg.includes('does not exist')) return true;
  if (msg.includes('relation') && msg.includes('does not exist')) return true;

  return false;
};

// Phase 2.5 — server returned a metadata version conflict.
export const isVersionConflictError = (err: any): boolean => {
  if (!err) return false;
  const code: string = err?.code || err?.error?.code || '';
  const msg: string = (err?.message || err?.error?.message || String(err)).toLowerCase();
  return code === '40001' || msg.includes('metadata_version_conflict');
};

export const ackFailure = async (id: number, err: any): Promise<void> => {
  const row = await idb.sync_queue.get(id);
  if (!row) return;
  const attempts = (row.attempts || 0) + 1;
  const msg = (err?.message || String(err) || 'unknown').slice(0, 500);

  // Phase 2.5 — server-side version conflict. Log it, then drop the queue item.
  // The next pull cycle will surface the server-winning row through the
  // existing conflict pipeline (recordConflict) so the user sees it.
  if (isVersionConflictError(err)) {
    try {
      await idb.conflicts.add({
        table: row.table,
        record_id: row.record_id,
        store_id: row.store_id,
        reason: 'server_version_conflict_40001',
        local_version: (row as any).version_number,
        local_snapshot: row.payload,
        cloud_snapshot: null,
        resolution: 'kept_cloud',
        detected_at: new Date().toISOString(),
      });
    } catch {}
    await idb.sync_queue.delete(id);
    console.warn('[SyncQueue] Server version conflict — dropped queue item', {
      id, table: row.table, record_id: row.record_id, msg,
    });
    return;
  }

  const permanent = isPermanentError(err);
  const shouldPoison =
    (permanent && attempts >= MAX_PERMANENT_ATTEMPTS) ||
    attempts >= MAX_TRANSIENT_ATTEMPTS;

  if (shouldPoison) {
    await idb.sync_queue.update(id, {
      attempts,
      last_error: `[POISONED ${permanent ? 'permanent' : 'transient'}] ${msg}`,
      next_attempt_at: new Date(8640000000000000).toISOString(),
      poisoned: true,
    });
    console.error('[SyncQueue] Item poisoned', {
      id, table: row.table, record_id: row.record_id, attempts, msg,
    });
    return;
  }

  await idb.sync_queue.update(id, {
    attempts,
    last_error: msg,
    next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
  });
};

// R3: when a store becomes active, adopt previously orphaned items.
// (Defensive — enqueue currently refuses to add orphans, but if any legacy
// rows exist with empty store_id we move them under the active store.)
export const adoptOrphanedItems = async (storeId: string): Promise<number> => {
  if (!storeId) return 0;
  const orphans = await idb.sync_queue.where('store_id').equals('').toArray();
  if (!orphans.length) return 0;
  await idb.sync_queue.bulkPut(orphans.map(o => ({ ...o, store_id: storeId })));
  return orphans.length;
};

// ---- Poison queue management (R2) ----

export const listPoisoned = async (): Promise<SyncQueueItem[]> => {
  const all = await idb.sync_queue.toArray();
  return all.filter(r => !!(r as any).poisoned);
};

export const retryPoisoned = async (id: number): Promise<void> => {
  const row = await idb.sync_queue.get(id);
  if (!row) return;
  await idb.sync_queue.update(id, {
    attempts: 0,
    last_error: undefined,
    next_attempt_at: new Date().toISOString(),
    poisoned: false,
  });
};

export const discardPoisoned = async (id: number): Promise<void> => {
  await idb.sync_queue.delete(id);
};

// ---- Health snapshot for debug UI ----
export const queueStats = async () => {
  const all = await idb.sync_queue.toArray();
  const poisoned = all.filter(r => !!(r as any).poisoned);
  const oldest = all.length
    ? all.reduce((a, b) => (a.enqueued_at < b.enqueued_at ? a : b)).enqueued_at
    : null;
  const orphanCount = (await idb.meta.get(ORPHAN_COUNTER_KEY))?.value || 0;
  return {
    total: all.length,
    active: all.length - poisoned.length,
    poisoned: poisoned.length,
    oldestEnqueuedAt: oldest,
    orphansSkipped: orphanCount,
  };
};

// ---- Leader election (unchanged) ----
let heldLock = false;
export const withLeaderLock = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
  if (typeof navigator === 'undefined') return fn();
  const locks: any = (navigator as any).locks;
  if (locks?.request) {
    let result: T | null = null;
    await locks.request(name, { ifAvailable: true }, async (lock: any) => {
      if (!lock) return;
      heldLock = true;
      try { result = await fn(); } finally { heldLock = false; }
    });
    return result;
  }
  const key = `__lock_${name}`;
  const now = Date.now();
  const existing = parseInt(localStorage.getItem(key) || '0', 10);
  if (existing && now - existing < 10_000) return null;
  localStorage.setItem(key, String(now));
  try { return await fn(); } finally { localStorage.removeItem(key); }
};

export const isLeader = () => heldLock;
