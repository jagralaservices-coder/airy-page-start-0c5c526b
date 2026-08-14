import { supabase } from '@/integrations/supabase/client';

export interface LocalChecklistResult {
  id: string;
  checklist_id: string;
  merchant_id?: string | null;
  store_id?: string | null;
  status: string;
  total_tasks_count?: number;
  completed_tasks_count?: number;
  overall_score?: number;
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LocalChecklistVerification {
  id: string;
  result_id: string;
  task_id: string;
  checklist_id?: string;
  merchant_id?: string | null;
  store_id?: string | null;
  status: string;
  uploaded_images: string[];
  ai_confidence_score: number;
  ai_verdict?: string;
  ai_metrics?: any;
  reject_reasons?: string[];
  reviewer_comments?: string;
  gps_location?: any;
  timestamp: string;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

const STORAGE_KEY_RESULTS = 'maxora_checklist_results_v2';
const STORAGE_KEY_VERIFS = 'maxora_checklist_verifications_v2';

// Helper: Get local items
export function getLocalResults(): LocalChecklistResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESULTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getLocalVerifications(): LocalChecklistVerification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VERIFS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Helper: Save local items
export function saveLocalResults(items: LocalChecklistResult[]) {
  try {
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(items));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }
}

export function saveLocalVerifications(items: LocalChecklistVerification[]) {
  try {
    localStorage.setItem(STORAGE_KEY_VERIFS, JSON.stringify(items));
  } catch (err) {
    console.warn('LocalStorage verifications save error:', err);
  }
}

// Unified API: Save / Upsert Verification (tries Supabase, falls back to LocalStorage)
export async function saveChecklistVerification(data: Partial<LocalChecklistVerification>): Promise<LocalChecklistVerification> {
  const id = data.id || `verif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: LocalChecklistVerification = {
    id,
    result_id: data.result_id || 'res_default',
    task_id: data.task_id || 'task_default',
    checklist_id: data.checklist_id,
    merchant_id: data.merchant_id || null,
    store_id: data.store_id || null,
    status: data.status || 'pending',
    uploaded_images: data.uploaded_images || [],
    ai_confidence_score: data.ai_confidence_score ?? 85,
    ai_verdict: data.ai_verdict || 'completed',
    ai_metrics: data.ai_metrics || {},
    reject_reasons: data.reject_reasons || [],
    reviewer_comments: data.reviewer_comments || '',
    gps_location: data.gps_location || null,
    timestamp: data.timestamp || new Date().toISOString(),
    created_by: data.created_by || null,
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Always update LocalStorage for 100% offline & schema-resilient persistence
  const localVerifs = getLocalVerifications();
  const existingIdx = localVerifs.findIndex((v) => v.id === record.id || (v.result_id === record.result_id && v.task_id === record.task_id));
  if (existingIdx >= 0) {
    localVerifs[existingIdx] = { ...localVerifs[existingIdx], ...record };
  } else {
    localVerifs.unshift(record);
  }
  saveLocalVerifications(localVerifs);

  // Try Supabase sync silently
  try {
    await supabase.from('checklist_verifications' as any).upsert(record as any);
  } catch (err) {
    console.info('Supabase checklist_verifications table not found, using local storage.');
  }

  return record;
}

// Unified API: Save / Upsert Result (tries Supabase, falls back to LocalStorage)
export async function saveChecklistResult(data: Partial<LocalChecklistResult>): Promise<LocalChecklistResult> {
  const id = data.id || `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: LocalChecklistResult = {
    id,
    checklist_id: data.checklist_id || '',
    merchant_id: data.merchant_id || null,
    store_id: data.store_id || null,
    status: data.status || 'in_progress',
    total_tasks_count: data.total_tasks_count || 1,
    completed_tasks_count: data.completed_tasks_count || 0,
    overall_score: data.overall_score || 85,
    submitted_at: data.submitted_at || null,
    approved_at: data.approved_at || null,
    approved_by: data.approved_by || null,
    created_by: data.created_by || null,
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Always update LocalStorage
  const localResults = getLocalResults();
  const existingIdx = localResults.findIndex((r) => r.id === record.id);
  if (existingIdx >= 0) {
    localResults[existingIdx] = { ...localResults[existingIdx], ...record };
  } else {
    localResults.unshift(record);
  }
  saveLocalResults(localResults);

  // Try Supabase sync
  try {
    await supabase.from('checklist_results' as any).upsert(record as any);
  } catch {
    console.info('Supabase checklist_results table not found, stored locally.');
  }

  return record;
}

// Unified API: Query Results
export async function fetchChecklistResults(checklistId?: string): Promise<LocalChecklistResult[]> {
  const localItems = getLocalResults().filter((r) => !checklistId || r.checklist_id === checklistId);
  try {
    let query = supabase.from('checklist_results' as any).select('*').order('created_at', { ascending: false });
    if (checklistId) query = query.eq('checklist_id', checklistId);
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      // Merge remote & local items
      const remoteIds = new Set(data.map((d: any) => d.id));
      const combined = [...data, ...localItems.filter((l) => !remoteIds.has(l.id))];
      return combined;
    }
  } catch {
    // ignore
  }
  return localItems;
}

// Unified API: Query Verifications
export async function fetchChecklistVerifications(checklistId?: string, resultId?: string): Promise<LocalChecklistVerification[]> {
  const localVerifs = getLocalVerifications().filter((v) => {
    if (resultId && v.result_id === resultId) return true;
    if (checklistId && v.checklist_id === checklistId) return true;
    return !checklistId && !resultId;
  });

  try {
    let query = supabase.from('checklist_verifications' as any).select('*').order('created_at', { ascending: false });
    if (resultId) {
      query = query.eq('result_id', resultId);
    } else if (checklistId) {
      query = query.eq('checklist_id', checklistId);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      const remoteIds = new Set(data.map((d: any) => d.id));
      const combined = [...data, ...localVerifs.filter((l) => !remoteIds.has(l.id))];
      return combined;
    }
  } catch {
    // ignore
  }
  return localVerifs;
}
