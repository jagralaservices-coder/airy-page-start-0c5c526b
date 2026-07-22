/**
 * MerchantContext — Phase 2A extraction.
 *
 * Resolves and caches the current user's merchant_id (a.k.a. customer_id in
 * legacy schema) from the user_roles table. Provides a single, memoized
 * source of truth so downstream contexts (Store, Subscription, POSData)
 * can stop re-running merchant resolution independently.
 *
 * Resolution rules (mirrors the logic embedded in POSContext, unchanged):
 *  - Query user_roles for the current auth user, is_active = true.
 *  - Prefer rows that carry a non-null merchant_id.
 *  - Break ties by role priority: super_admin > admin > owner/merchant >
 *    store_manager > staff > cashier.
 *  - merchantId = first row's merchant_id ?? customer_id.
 *
 * This provider does NOT mutate any behavior of POSContext. POSContext keeps
 * doing its own resolution today; a follow-up phase will migrate it to read
 * from here.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MerchantContextValue {
  merchantId: string | null;
  storeIdFromRole: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const MerchantContext = createContext<MerchantContextValue | undefined>(undefined);

const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 1,
  admin: 2,
  owner: 3,
  merchant: 3,
  store_manager: 4,
  staff: 5,
  cashier: 6,
};

// Per-auth-user cache so remounts don't refetch.
const merchantCache = new Map<string, { merchantId: string | null; storeId: string | null }>();

export const MerchantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [storeIdFromRole, setStoreIdFromRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const resolve = useCallback(async (): Promise<void> => {
    if (!user?.id) {
      setMerchantId(null);
      setStoreIdFromRole(null);
      return;
    }
    const cached = merchantCache.get(user.id);
    if (cached) {
      setMerchantId(cached.merchantId);
      setStoreIdFromRole(cached.storeId);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('user_roles')
        .select('merchant_id, customer_id, role, store_id')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (qErr) throw qErr;
      const rows = (data || []).slice().sort((a: any, b: any) => {
        const am = a.merchant_id ? 0 : 1;
        const bm = b.merchant_id ? 0 : 1;
        if (am !== bm) return am - bm;
        return (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);
      });
      const top: any = rows[0] || null;
      const mId = (top?.merchant_id as string | null) || (top?.customer_id as string | null) || null;
      const sId = (top?.store_id as string | null) || null;
      merchantCache.set(user.id, { merchantId: mId, storeId: sId });
      setMerchantId(mId);
      setStoreIdFromRole(sId);
    } catch (e: any) {
      setError(e?.message || 'Failed to resolve merchant');
      setMerchantId(null);
      setStoreIdFromRole(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (user?.id) merchantCache.delete(user.id);
    if (inflight.current) return inflight.current;
    inflight.current = resolve().finally(() => { inflight.current = null; });
    return inflight.current;
  }, [resolve, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMerchantId(null);
      setStoreIdFromRole(null);
      return;
    }
    void resolve();
  }, [isAuthenticated, resolve]);

  const value = useMemo<MerchantContextValue>(() => ({
    merchantId,
    storeIdFromRole,
    isLoading,
    error,
    refresh,
  }), [merchantId, storeIdFromRole, isLoading, error, refresh]);

  return <MerchantContext.Provider value={value}>{children}</MerchantContext.Provider>;
};

export function useMerchant(): MerchantContextValue {
  const ctx = useContext(MerchantContext);
  if (!ctx) throw new Error('useMerchant must be used within a MerchantProvider');
  return ctx;
}

export function useMerchantSafe(): MerchantContextValue | null {
  return useContext(MerchantContext) ?? null;
}
