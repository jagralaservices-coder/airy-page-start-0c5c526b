/**
 * POSDataContext — Phase 2C extraction (infrastructure step).
 *
 * A dedicated provider + React Query facade that owns business-data reads.
 * Downstream turns migrate individual slices (categories, menu items,
 * products, customers, orders, tables, KOT, inventory) OUT of POSContext
 * and INTO the hooks exported here.
 *
 * This first pass ships the facade + a shared query-key namespace so every
 * consumer can start reading through one cache instead of each mount
 * triggering its own fetch. POSContext continues to hold data ownership
 * today; the migration is deliberately incremental to avoid regressions.
 *
 * Data-loading contract:
 *   Merchant (useMerchant) -> Store (useStore) -> Business data (here).
 * This context NEVER resolves merchant or store; it only consumes them.
 *
 * All keys live in `posQueryKeys` so invalidation from realtime handlers,
 * offline-sync completion, and manual refreshes hits exactly one cache.
 */
import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMerchant } from '@/contexts/MerchantContext';
import { useStore } from '@/contexts/StoreContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { onPosEvent } from '@/lib/posEvents';

// ---------------------------------------------------------------------------
// Query-key namespace — the single vocabulary the app uses to identify data.
// ---------------------------------------------------------------------------
export const posQueryKeys = {
  all: ['pos'] as const,
  categories: (storeId: string | null) => ['pos', 'categories', storeId] as const,
  menuItems: (storeId: string | null) => ['pos', 'menu-items', storeId] as const,
  products: (merchantId: string | null, storeId: string | null) =>
    ['pos', 'products', merchantId, storeId] as const,
  customers: (merchantId: string | null) => ['pos', 'customers', merchantId] as const,
  orders: (storeId: string | null) => ['pos', 'orders', storeId] as const,
  tables: (storeId: string | null) => ['pos', 'tables', storeId] as const,
  kot: (storeId: string | null) => ['pos', 'kot', storeId] as const,
  inventory: (storeId: string | null) => ['pos', 'inventory', storeId] as const,
  recipes: (storeId: string | null) => ['pos', 'recipes', storeId] as const,
};

export interface POSDataContextValue {
  merchantId: string | null;
  storeId: string | null;
  isReady: boolean;
  invalidate: (slice?: keyof typeof posQueryKeys | 'all') => Promise<void>;
  refetch: (slice: keyof typeof posQueryKeys) => Promise<void>;
  queryClient: QueryClient;
}

const POSDataContext = createContext<POSDataContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Fetchers — each returns rows for the shared cache. Callers should NOT query
// these tables directly; use the hooks below so every consumer benefits from
// dedup + realtime invalidation.
// ---------------------------------------------------------------------------
async function fetchCategories(storeId: string) {
  const { data, error } = await supabase
    .from('categories').select('*').eq('store_id', storeId).order('name');
  if (error) throw error;
  return data || [];
}
async function fetchMenuItems(storeId: string) {
  const { data, error } = await supabase
    .from('menu_items').select('*').eq('store_id', storeId);
  if (error) throw error;
  return data || [];
}
async function fetchProducts(storeId: string) {
  const { data, error } = await supabase
    .from('products').select('*').eq('store_id', storeId);
  if (error) throw error;
  return data || [];
}
async function fetchCustomers(merchantId: string) {
  const { data, error } = await supabase
    .from('pos_customers').select('*').eq('merchant_id', merchantId);
  if (error) throw error;
  return data || [];
}
async function fetchTables(storeId: string) {
  const { data, error } = await supabase
    .from('restaurant_tables').select('*').eq('store_id', storeId);
  if (error) throw error;
  return data || [];
}
async function fetchInventory(storeId: string) {
  const { data, error } = await supabase
    .from('inventory_items').select('*').eq('store_id', storeId);
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const POSDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { merchantId } = useMerchant();
  const { activeStoreId } = useStore();
  const queryClient = useQueryClient();
  const realtime = useRealtime();

  const isReady = !!isAuthenticated && !!merchantId;

  // Central realtime → cache invalidation. One subscription per relevant
  // table; handlers just invalidate — never re-fetch imperatively.
  React.useEffect(() => {
    if (!isReady || !activeStoreId) return;
    const filter = `store_id=eq.${activeStoreId}`;
    const subs = [
      realtime.subscribe({ table: 'menu_items', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.menuItems(activeStoreId) })),
      realtime.subscribe({ table: 'categories', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.categories(activeStoreId) })),
      realtime.subscribe({ table: 'products', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.products(merchantId, activeStoreId) })),
      realtime.subscribe({ table: 'orders', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orders(activeStoreId) })),
      realtime.subscribe({ table: 'restaurant_tables', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tables(activeStoreId) })),
      realtime.subscribe({ table: 'inventory_items', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.inventory(activeStoreId) })),
    ];
    return () => subs.forEach((u) => u());
  }, [isReady, activeStoreId, merchantId, realtime, queryClient]);

  // Cross-hook event bus → cache invalidation.
  React.useEffect(() => {
    const offs = [
      onPosEvent('pos:store-changed', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.all })),
      onPosEvent('pos:inventory-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.inventory(activeStoreId) })),
      onPosEvent('pos:menu-updated', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.menuItems(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.categories(activeStoreId) });
      }),
      onPosEvent('pos:order-created', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orders(activeStoreId) })),
      onPosEvent('pos:order-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orders(activeStoreId) })),
      onPosEvent('pos:customer-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.customers(merchantId) })),
    ];
    return () => offs.forEach((o) => o());
  }, [queryClient, activeStoreId, merchantId]);

  const invalidate = useCallback(async (slice?: keyof typeof posQueryKeys | 'all') => {
    if (!slice || slice === 'all') {
      await queryClient.invalidateQueries({ queryKey: posQueryKeys.all });
      return;
    }
    // Best-effort narrow invalidation; unknown slices fall through to 'all'.
    const key = (posQueryKeys as any)[slice]?.(activeStoreId) ?? posQueryKeys.all;
    await queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, activeStoreId]);

  const refetch = useCallback(async (slice: keyof typeof posQueryKeys) => {
    const key = (posQueryKeys as any)[slice]?.(activeStoreId) ?? posQueryKeys.all;
    await queryClient.refetchQueries({ queryKey: key });
  }, [queryClient, activeStoreId]);

  const value = useMemo<POSDataContextValue>(() => ({
    merchantId,
    storeId: activeStoreId,
    isReady,
    invalidate,
    refetch,
    queryClient,
  }), [merchantId, activeStoreId, isReady, invalidate, refetch, queryClient]);

  return <POSDataContext.Provider value={value}>{children}</POSDataContext.Provider>;
};

export function usePOSData(): POSDataContextValue {
  const ctx = useContext(POSDataContext);
  if (!ctx) throw new Error('usePOSData must be used within a POSDataProvider');
  return ctx;
}
export function usePOSDataSafe(): POSDataContextValue | null {
  return useContext(POSDataContext) ?? null;
}

// ---------------------------------------------------------------------------
// Shared-cache hooks. Migrate consumers onto these; POSContext state stays
// intact until a slice is fully cut over in a later turn.
// ---------------------------------------------------------------------------
type QOpts<T> = Omit<UseQueryOptions<T, Error, T, any>, 'queryKey' | 'queryFn'>;

export function useCategoriesQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.categories(activeStoreId),
    queryFn: () => fetchCategories(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 60_000,
    ...opts,
  });
}
export function useMenuItemsQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.menuItems(activeStoreId),
    queryFn: () => fetchMenuItems(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 60_000,
    ...opts,
  });
}
export function useProductsQuery(opts?: QOpts<any[]>) {
  const { merchantId } = useMerchant();
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.products(merchantId, activeStoreId),
    queryFn: () => fetchProducts(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 60_000,
    ...opts,
  });
}
export function useCustomersQuery(opts?: QOpts<any[]>) {
  const { merchantId } = useMerchant();
  return useQuery({
    queryKey: posQueryKeys.customers(merchantId),
    queryFn: () => fetchCustomers(merchantId!),
    enabled: !!merchantId,
    staleTime: 30_000,
    ...opts,
  });
}
export function useTablesQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.tables(activeStoreId),
    queryFn: () => fetchTables(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 30_000,
    ...opts,
  });
}
export function useInventoryQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.inventory(activeStoreId),
    queryFn: () => fetchInventory(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 30_000,
    ...opts,
  });
}
