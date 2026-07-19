import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getActiveStore } from '@/lib/store';
const getActiveStoreId = () => getActiveStore();

export interface GatewayConnection {
  id: string;
  store_id: string;
  gateway_id: string;
  display_name: string | null;
  merchant_account_id: string | null;
  api_key: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  environment: 'sandbox' | 'production';
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  last_test_at: string | null;
  last_test_result: any;
  last_sync_at: string | null;
  extra: any;
}

export function useGatewayConnections() {
  const [connections, setConnections] = useState<GatewayConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const storeId = getActiveStoreId();
    if (!storeId) { setConnections([]); setLoading(false); return; }
    const { data, error } = await (supabase as any)
      .from('merchant_gateway_connections')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    if (!error) setConnections((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsert = useCallback(async (payload: Partial<GatewayConnection> & {
    gateway_id: string; secretKey?: string;
  }) => {
    const storeId = getActiveStoreId();
    if (!storeId) throw new Error('No active store');
    const { secretKey, ...rest } = payload as any;
    const row: any = {
      ...rest,
      store_id: storeId,
      environment: rest.environment || 'sandbox',
    };
    // secretKey is stored as plaintext on the server-side via edge fn for encryption ideally;
    // for this hub we send it through a dedicated save function
    const { data, error } = await supabase.functions.invoke('payment-hub-save-connection', {
      body: { connection: row, secretKey },
    });
    if (error) throw error;
    await load();
    return data;
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from('merchant_gateway_connections').delete().eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    const { error } = await (supabase as any)
      .from('merchant_gateway_connections')
      .update({ enabled })
      .eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  return { connections, loading, reload: load, upsert, remove, toggle };
}

export function useHasActiveGateway() {
  const { connections, loading } = useGatewayConnections();
  const active = connections.find(c => c.enabled && c.status === 'connected');
  return { active, loading, any: !!active };
}
