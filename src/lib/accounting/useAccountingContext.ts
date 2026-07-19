import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAccountingContext() {
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { if (alive) setLoading(false); return; }
      const { data: roles } = await supabase
        .from('user_roles')
        .select('merchant_id, store_id, role')
        .eq('user_id', uid)
        .eq('is_active', true);
      const withMerchant = (roles ?? []).find((r: any) => r.merchant_id);
      const active = localStorage.getItem('activeStoreId');
      if (alive) {
        setMerchantId(withMerchant?.merchant_id ?? null);
        setStoreId(active || withMerchant?.store_id || null);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { merchantId, storeId, loading };
}
