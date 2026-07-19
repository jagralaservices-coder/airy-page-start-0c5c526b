// Phase 2 — Envelope metadata helpers.
// organization_id = merchant_id (per approved decision — no new tables).
// session_id: per-tab id from session.ts
// version_number: incremented client-side on every real change
// updated_by: best-effort user identifier (auth user id or store id)

import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from './session';

export { getSessionId };

export interface Envelope {
  organization_id: string;
  store_id: string;
  session_id: string;
  version_number: number;
  updated_by: string;
  updated_at: string;
}

let cachedUserId: string | null = null;
let cachedAt = 0;

const readActiveStoreData = (): any => {
  try {
    const raw = localStorage.getItem('pos_active_store_data');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const getOrganizationId = (): string => {
  const sd = readActiveStoreData();
  return (sd?.merchant_id || sd?.merchantId || '') as string;
};

export const getActiveStoreId = (): string => {
  const sd = readActiveStoreData();
  if (sd?.id) return sd.id;
  const raw = localStorage.getItem('pos_active_store');
  if (raw) {
    try { const v = JSON.parse(raw); return typeof v === 'string' ? v : v?.id || ''; } catch { return raw; }
  }
  return '';
};

// Best-effort current user identifier. Cached for 30s to avoid hammering auth.
export const getUpdatedBy = async (): Promise<string> => {
  const now = Date.now();
  if (cachedUserId && now - cachedAt < 30_000) return cachedUserId;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (uid) {
      cachedUserId = uid;
      cachedAt = now;
      return uid;
    }
  } catch {}
  // Fall back to store-login identity
  const sd = readActiveStoreData();
  const fallback = sd?.id ? `store:${sd.id}` : 'unknown';
  cachedUserId = fallback;
  cachedAt = now;
  return fallback;
};

export const getUpdatedBySync = (): string => cachedUserId || (() => {
  const sd = readActiveStoreData();
  return sd?.id ? `store:${sd.id}` : 'unknown';
})();

export const buildEnvelope = (
  prevVersion: number | undefined,
  storeId: string,
): Envelope => ({
  organization_id: getOrganizationId(),
  store_id: storeId,
  session_id: getSessionId(),
  version_number: (prevVersion || 0) + 1,
  updated_by: getUpdatedBySync(),
  updated_at: new Date().toISOString(),
});

// Stable string snapshot for diffing — strips envelope/transient fields.
export const stableSnapshot = (record: any): string => {
  if (!record || typeof record !== 'object') return JSON.stringify(record);
  const { _meta, pendingSync, lastUpdated, updated_at, ...rest } = record;
  const keys = Object.keys(rest).sort();
  const ordered: any = {};
  for (const k of keys) ordered[k] = (rest as any)[k];
  return JSON.stringify(ordered);
};

// Prime the user cache eagerly so synchronous writes carry the real id.
export const primeUpdatedBy = () => { void getUpdatedBy(); };
