import { supabase } from '@/integrations/supabase/client';
import { getCurrentStoreId, getCurrentStoreCode } from '@/lib/storeIdentity';

// Re-export identity helpers for backward compatibility with any lingering
// imports. New consumers should import from '@/lib/storeIdentity'.
export { getCurrentStoreId, getCurrentStoreCode };

// Shared edge-function wrapper used by POSDataContext to read cloud data
// through the sync-store-data / sync-orders edge functions. The legacy
// `useCloudData` React hook has been retired — POSDataContext is now the
// single React Query owner. This helper remains as the low-level fetcher.
export const fetchCloudData = async (
  dataType: string,
  storeId: string,
  storeCode: string | null,
) => {
  if (localStorage.getItem('pos_login_as_demo') === 'true') return null;

  if (dataType === 'orders') {
    const { data, error } = await supabase.functions.invoke('sync-orders', {
      body: { action: 'fetch', store_id: storeId, store_code: storeCode },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  const body: any = { action: 'fetch', store_id: storeId, data_type: dataType };
  if (storeCode) body.store_code = storeCode;

  const { data, error } = await supabase.functions.invoke('sync-store-data', { body });

  if (error) {
    console.error(`[CloudData] Error fetching ${dataType}:`, error);
    throw error;
  }

  if (data?.error) {
    console.error(`[CloudData] Edge function returned error for ${dataType}:`, data.error);
    throw new Error(data.error);
  }

  return data;
};
