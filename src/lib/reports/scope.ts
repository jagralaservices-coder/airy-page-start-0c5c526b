import { useOwnerStore } from '@/hooks/useOwnerStore';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export interface ReportScope {
  isOwner: boolean;
  allowCompanyAggregates: boolean;
  canSeeOutlets: boolean;
  storeId: string | null;
  storeName: string;
}

const getStoreIdFromStorage = (): string | null => {
  try {
    const d = localStorage.getItem('pos_active_store_data');
    if (d) { const p = JSON.parse(d); if (p?.id) return p.id; }
  } catch {}
  const a = localStorage.getItem('pos_active_store');
  if (a) { try { return JSON.parse(a); } catch { return a; } }
  return null;
};

export const useReportScope = (): ReportScope => {
  const { userRole } = useSupabaseAuth();
  const { isOwner, selectedStoreId, selectedStoreName } = useOwnerStore();
  const role = userRole?.role;
  const owner = isOwner || role === 'admin' || role === 'super_admin';
  const storeId = owner ? selectedStoreId : getStoreIdFromStorage();
  return {
    isOwner: owner,
    allowCompanyAggregates: owner,
    canSeeOutlets: owner,
    storeId,
    storeName: owner ? (selectedStoreName || 'All Stores') : (selectedStoreName || 'My Store'),
  };
};
