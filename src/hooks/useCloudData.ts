import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';
import { getCurrentStoreId, getCurrentStoreCode } from '@/lib/storeIdentity';

// Re-export identity helpers for backward compatibility.
// New consumers should import from '@/lib/storeIdentity'.
export { getCurrentStoreId, getCurrentStoreCode };

// Generic fetcher using the edge function
export const fetchCloudData = async (dataType: string, storeId: string, storeCode: string | null) => {
  if (localStorage.getItem('pos_login_as_demo') === 'true') return null;
  
  if (dataType === 'orders') {
    const { data, error } = await supabase.functions.invoke('sync-orders', {
      body: { action: 'fetch', store_id: storeId, store_code: storeCode }
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

export const useCloudData = <T>(dataType: string, transformData: (data: any) => T, fallback: T) => {
  const storeId = getCurrentStoreId();
  const storeCode = getCurrentStoreCode();
  
  return useQuery({
    queryKey: ['cloudData', storeId, dataType],
    queryFn: async () => {
      if (!storeId) return fallback;
      const response = await fetchCloudData(dataType, storeId, storeCode);
      return transformData(response);
    },
    enabled: !!storeId && localStorage.getItem('pos_login_as_demo') !== 'true',
    refetchInterval: 10000, // Near real-time periodic sync (10 seconds)
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: fallback,
  });
};
