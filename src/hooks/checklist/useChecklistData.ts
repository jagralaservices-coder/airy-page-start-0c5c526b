import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export type ChecklistFrequency = 'daily' | 'weekly' | 'monthly' | 'before_shift' | 'after_shift' | 'custom' | 'once';
export type ChecklistAnswerType = 'yes_no' | 'text' | 'number' | 'photo' | 'multi_photo' | 'signature' | 'video';
export type SubmissionStatus = 'pending' | 'ai_pass' | 'ai_fail' | 'approved' | 'rejected';

export interface Checklist {
  id: string;
  merchant_id: string;
  store_id: string | null;
  name: string;
  description: string | null;
  department: string | null;
  frequency: ChecklistFrequency;
  custom_cron: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  answer_type: ChecklistAnswerType;
  required: boolean;
  photo_required: boolean;
  video_required: boolean;
  gps_required: boolean;
  time_required: boolean;
  ai_verify: boolean;
  order_index: number;
}

export interface ChecklistAssignment {
  id: string;
  checklist_id: string;
  assigned_role: string | null;
  assigned_user_id: string | null;
  store_id: string | null;
  is_active: boolean;
}

const table = (name: string) => supabase.from(name as any);

export function useChecklists() {
  const { merchantId } = useMerchant();
  return useQuery({
    queryKey: ['checklists', merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await table('checklists')
        .select('*')
        .eq('merchant_id', merchantId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Checklist[];
    },
  });
}

export function useChecklistItems(checklistId: string | null | undefined) {
  return useQuery({
    queryKey: ['checklist_items', checklistId],
    enabled: !!checklistId,
    queryFn: async () => {
      const { data, error } = await table('checklist_items')
        .select('*')
        .eq('checklist_id', checklistId!)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChecklistItem[];
    },
  });
}

export function useAssignments(checklistId?: string) {
  return useQuery({
    queryKey: ['checklist_assignments', checklistId ?? 'all'],
    queryFn: async () => {
      let q = table('checklist_assignments').select('*');
      if (checklistId) q = q.eq('checklist_id', checklistId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChecklistAssignment[];
    },
  });
}

export function useAssignedChecklistsForMe() {
  const { user, userRole } = useSupabaseAuth();
  return useQuery({
    queryKey: ['assigned_checklists', user?.id, userRole?.role],
    enabled: !!user?.id,
    queryFn: async () => {
      const roleName = userRole?.role;
      const filters: string[] = [`assigned_user_id.eq.${user!.id}`];
      if (roleName) filters.push(`assigned_role.eq.${roleName}`);
      const { data: asg, error } = await table('checklist_assignments')
        .select('*')
        .eq('is_active', true)
        .or(filters.join(','));
      if (error) throw error;
      const ids = Array.from(new Set((asg ?? []).map((a: any) => a.checklist_id)));
      if (!ids.length) return [] as Checklist[];
      const { data: cls } = await table('checklists').select('*').in('id', ids).eq('is_active', true);
      return (cls ?? []) as Checklist[];
    },
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['checklist_templates'],
    queryFn: async () => {
      const { data, error } = await table('checklist_templates').select('*').order('title');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSubmissions(filter?: { staffOnly?: boolean; status?: SubmissionStatus }) {
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  return useQuery({
    queryKey: ['checklist_submissions', merchantId, filter?.staffOnly, filter?.status, user?.id],
    enabled: !!merchantId || !!filter?.staffOnly,
    queryFn: async () => {
      let q = table('checklist_submissions').select('*, ai_verification_results(*), ai_item_verification_results(*)').order('submitted_at', { ascending: false });
      if (filter?.staffOnly && user?.id) q = q.eq('staff_user_id', user.id);
      else if (merchantId) q = q.eq('merchant_id', merchantId);
      if (filter?.status) q = q.eq('status', filter.status);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}


export function useNotifications() {
  const { user } = useSupabaseAuth();
  return useQuery({
    queryKey: ['checklist_notifications', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await table('checklist_notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvalidateChecklists() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['checklists'] });
    qc.invalidateQueries({ queryKey: ['checklist_items'] });
    qc.invalidateQueries({ queryKey: ['checklist_assignments'] });
    qc.invalidateQueries({ queryKey: ['checklist_submissions'] });
  };
}

export async function logChecklistActivity(params: {
  merchant_id: string;
  actor_id: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  meta?: any;
}) {
  await table('checklist_activity_logs').insert(params);
}
