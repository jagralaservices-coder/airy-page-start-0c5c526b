// Phase 2 — Conflict detection & resolution for the offline-first layer.
//
// Rules (priority order):
//   R1. Never overwrite pending local changes.
//   R2. Higher version_number wins.
//   R3. Tie -> latest updated_at wins.
//   R4. Log every conflict.
//   R5. Preserve losing snapshot for recovery (conflicts table).

import { idb, CoreTable, ConflictRow, IDBRecord } from './idb';
import { pendingForStore } from './syncQueue';

const toTime = (v: any): number => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

export interface MergeOutcome {
  apply: boolean;          // should the cloud row replace local data?
  reason: string;          // why
  resolution: 'kept_local' | 'kept_cloud';
}

export interface MergeInputs {
  table: CoreTable;
  storeId: string;
  recordId: string;
  localData: any | undefined;          // from localStorage / current state
  localEnvelope: IDBRecord | undefined; // from IDB wrapper (may be undefined)
  cloudData: any;                       // incoming server row
  hasPendingQueueItem: boolean;        // true if sync_queue has an unflushed op
}

export const decideMerge = (i: MergeInputs): MergeOutcome => {
  const { localData, localEnvelope, cloudData, hasPendingQueueItem } = i;

  if (!localData) {
    return { apply: true, reason: 'no_local', resolution: 'kept_cloud' };
  }

  // R1 — protect any unsynced local edit
  if (hasPendingQueueItem || localData?.pendingSync === true) {
    return {
      apply: false,
      reason: 'rule1_pending_local',
      resolution: 'kept_local',
    };
  }

  // R2 — higher version wins (only when both sides have a number).
  // Cloud version may be on row.metadata.version_number (Phase 2.5) or row.version_number.
  const lv = localEnvelope?.version_number;
  const cloudMeta = (cloudData as any)?.metadata || {};
  const cv =
    typeof cloudMeta.version_number === 'number'
      ? cloudMeta.version_number
      : typeof cloudMeta.version_number === 'string'
        ? parseInt(cloudMeta.version_number, 10)
        : (cloudData as any)?.version_number;
  if (typeof lv === 'number' && typeof cv === 'number') {
    if (cv > lv) return { apply: true,  reason: 'rule2_cloud_newer_version', resolution: 'kept_cloud' };
    if (cv < lv) return { apply: false, reason: 'rule2_local_newer_version', resolution: 'kept_local' };
    // equal versions fall through to R3
  }

  // R3 — timestamp tiebreaker. Strictly newer cloud wins; tie keeps local.
  const lt = toTime(localData?.lastUpdated || localData?.updated_at || localEnvelope?.updated_at);
  const ct = toTime(cloudMeta.updated_at || cloudData?.updated_at || cloudData?.lastUpdated);
  if (ct > lt) {
    return { apply: true, reason: 'rule3_cloud_newer_ts', resolution: 'kept_cloud' };
  }
  return { apply: false, reason: 'rule3_local_newer_or_tie', resolution: 'kept_local' };
};

export const recordConflict = async (
  input: MergeInputs,
  outcome: MergeOutcome,
): Promise<void> => {
  // Only log "real" conflicts — not the trivial no-local or strict-newer cases.
  const real =
    outcome.reason.startsWith('rule1_') ||
    outcome.reason === 'rule2_local_newer_version' ||
    outcome.reason === 'rule3_local_newer_or_tie';
  if (!real) return;

  const row: ConflictRow = {
    table: input.table,
    record_id: input.recordId,
    store_id: input.storeId,
    reason: outcome.reason,
    local_version: input.localEnvelope?.version_number,
    cloud_version: (input.cloudData as any)?.metadata?.version_number ?? (input.cloudData as any)?.version_number,
    local_updated_at: input.localData?.lastUpdated || input.localData?.updated_at,
    cloud_updated_at: (input.cloudData as any)?.metadata?.updated_at || input.cloudData?.updated_at,
    local_updated_by: input.localEnvelope?.updated_by,
    cloud_updated_by: (input.cloudData as any)?.metadata?.updated_by ?? (input.cloudData as any)?.updated_by,
    local_snapshot: input.localData,
    cloud_snapshot: input.cloudData,
    resolution: outcome.resolution,
    detected_at: new Date().toISOString(),
  };
  try {
    await idb.conflicts.add(row);
    // Cap log size — keep last 500
    const count = await idb.conflicts.count();
    if (count > 500) {
      const oldest = await idb.conflicts.orderBy('detected_at').limit(count - 500).primaryKeys();
      if (oldest.length) await idb.conflicts.bulkDelete(oldest);
    }
    console.warn('[Conflict]', row.table, row.record_id, outcome.reason, '→', outcome.resolution);
  } catch (e) {
    console.error('[Conflict] failed to log:', e);
  }
};

// Convenience: for a pull cycle, evaluate every cloud row against local data
// and return only the rows that should replace local. Pending-queue lookup is
// done once per (storeId) to avoid N round-trips.
export const filterApplicableCloudRows = async <T extends { id: string | number }>(
  table: CoreTable,
  storeId: string,
  localById: Map<string, any>,
  cloudRows: T[],
): Promise<T[]> => {
  if (!cloudRows.length) return [];

  // Build pending-record set once.
  const pendingItems = await pendingForStore(storeId);
  const pendingIds = new Set(
    pendingItems.filter(p => p.table === table).map(p => String(p.record_id)),
  );

  // Pre-load envelopes for all the ids we're considering.
  const idStrs = cloudRows.map(r => String(r.id));
  const envelopes = await (idb as any)[table].bulkGet(idStrs) as (IDBRecord | undefined)[];
  const envById = new Map<string, IDBRecord | undefined>();
  idStrs.forEach((id, i) => envById.set(id, envelopes[i]));

  const out: T[] = [];
  for (const cloud of cloudRows) {
    const recordId = String(cloud.id);
    const input: MergeInputs = {
      table,
      storeId,
      recordId,
      localData: localById.get(recordId),
      localEnvelope: envById.get(recordId),
      cloudData: cloud,
      hasPendingQueueItem: pendingIds.has(recordId),
    };
    const outcome = decideMerge(input);
    await recordConflict(input, outcome);
    if (outcome.apply) out.push(cloud);
  }
  return out;
};

// ---- Admin surface ----
export const conflictCount = (): Promise<number> => idb.conflicts.count();
export const listConflicts = async (limit = 50): Promise<ConflictRow[]> => {
  return idb.conflicts.orderBy('detected_at').reverse().limit(limit).toArray();
};
export const clearConflicts = async (): Promise<void> => { await idb.conflicts.clear(); };
