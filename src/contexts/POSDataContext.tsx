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
import { fetchCloudData, getCurrentStoreCode } from '@/hooks/useCloudData';
import { dbToLocalMenuItem, dbToLocalCategory, dbToLocalOrder, dbToLocalHeldBill } from '@/lib/transformers';
import type { MenuItem, Category, Order, HeldBill } from '@/lib/store';
import { queueStats, listPoisoned, retryPoisoned, discardPoisoned } from '@/lib/syncQueue';

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
  heldBills: (storeId: string | null) => ['pos', 'held-bills', storeId] as const,
  offlineQueue: () => ['pos', 'offline-queue'] as const,
  // Slice 7: Credit Ledger + Credit Payments — store-scoped ledger reads.
  creditLedger: (storeId: string | null) => ['pos', 'credit-ledger', storeId] as const,
  creditPayments: (storeId: string | null) => ['pos', 'credit-payments', storeId] as const,
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
async function fetchCategories(storeId: string): Promise<Category[]> {
  // Route through the same edge function POSContext previously used via
  // useCloudData so payload shape / RLS behaviour is identical.
  const storeCode = getCurrentStoreCode();
  const data = await fetchCloudData('categories', storeId, storeCode);
  return ((data?.items || []) as any[]).map(dbToLocalCategory);
}
async function fetchMenuItems(storeId: string): Promise<MenuItem[]> {
  const storeCode = getCurrentStoreCode();
  const data = await fetchCloudData('menu_items', storeId, storeCode);
  const ingredients = data?.ingredients || [];
  const variations = data?.variations || [];
  return ((data?.items || []) as any[]).map((item) =>
    dbToLocalMenuItem(item, ingredients, variations),
  );
}
async function fetchOrders(storeId: string): Promise<Order[]> {
  const storeCode = getCurrentStoreCode();
  const data = await fetchCloudData('orders', storeId, storeCode);
  return ((data?.orders || []) as any[]).map(dbToLocalOrder);
}
// Slice 6: Held Bills — single owner for the held-bills read path. Cart
// consumers should read via useHeldBillsQuery so every mount hits one cache
// and realtime + typed events fan out to every screen at once. Writes still
// flow through POSContext.holdBill / mergeBills / deleteHeldBill; this hook
// is strictly the read + cache surface.
async function fetchHeldBills(storeId: string): Promise<HeldBill[]> {
  const storeCode = getCurrentStoreCode();
  const data = await fetchCloudData('held_bills', storeId, storeCode);
  return ((data?.items || []) as any[]).map(dbToLocalHeldBill);
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
// Slice 7: Credit Ledger — store-scoped due sales with normalized columns.
// Consumers should read via useCreditLedgerQuery so realtime + typed events
// fan out from one cache. Writes still flow through POSContext credit
// helpers / useSaveCloudDataMutation('credit_ledger'); this hook is strictly
// the read + cache surface.
async function fetchCreditLedger(storeId: string) {
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
// Slice 7: Credit Payments — store-scoped payments against ledger entries.
async function fetchCreditPayments(storeId: string) {
  const { data, error } = await supabase
    .from('credit_payments')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
async function fetchTables(storeId: string) {
  const { data, error } = await supabase
    .from('restaurant_tables').select('*').eq('store_id', storeId);
  if (error) throw error;
  return data || [];
}
// Slice 5: KOT tickets + items scoped to the active store. Kitchen-facing
// consumers should read via useKOTQuery instead of touching supabase directly
// so realtime invalidations fan out to every screen from one cache.
export interface KOTTicket {
  id: string;
  order_id: string | null;
  table_id: string | null;
  store_id: string;
  status: string;
  kot_number: number | null;
  created_at: string;
  updated_at: string | null;
  items?: any[];
}
async function fetchKOT(storeId: string): Promise<KOTTicket[]> {
  const { data, error } = await supabase
    .from('kot_tickets')
    .select('*, items:kot_items(*)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as any as KOTTicket[];
}
async function fetchInventory(storeId: string) {
  const { data, error } = await supabase
    .from('inventory_items').select('*').eq('store_id', storeId);
  if (error) throw error;
  return data || [];
}
// Slice 4: Recipes — inventory_components rows scoped to the parent items in
// the active store. Filtered client-side on parent store because
// inventory_components has no store_id column of its own; we fetch parent
// inventory ids first, then components. Consumers should read via
// useRecipesQuery instead of touching supabase directly.
export interface RecipeComponent {
  id: string;
  parent_inventory_id: string;
  child_inventory_id: string;
  quantity_required: number;
  unit: string;
}
async function fetchRecipes(storeId: string): Promise<RecipeComponent[]> {
  const { data: parents, error: pErr } = await supabase
    .from('inventory_items').select('id').eq('store_id', storeId);
  if (pErr) throw pErr;
  const parentIds = (parents || []).map((r: any) => r.id);
  if (parentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('inventory_components')
    .select('id, parent_inventory_id, child_inventory_id, quantity_required, unit')
    .in('parent_inventory_id', parentIds);
  if (error) throw error;
  return (data || []) as RecipeComponent[];
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
      realtime.subscribe({ table: 'inventory_items', filter }, () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.inventory(activeStoreId) });
      }),
      // inventory_components has no store_id column, so subscribe without a
      // filter and invalidate the store-scoped recipes cache. RealtimeContext
      // dedupes channels so this stays a single connection.
      realtime.subscribe({ table: 'inventory_components' }, () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.recipes(activeStoreId) });
      }),
      // inventory_transactions logs (audit) also implies stock changed.
      realtime.subscribe({ table: 'inventory_transactions', filter }, () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.inventory(activeStoreId) });
      }),
      // Slice 5: KOT tickets/items. Tickets are store-scoped; items ride on
      // parent ticket ids so we subscribe without a filter and rely on the
      // shared kot cache invalidation. RealtimeContext dedupes channels.
      realtime.subscribe({ table: 'kot_tickets', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.kot(activeStoreId) })),
      realtime.subscribe({ table: 'kot_items' }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.kot(activeStoreId) })),
      // Slice 6: Held Bills — realtime invalidation, single subscription owner.
      realtime.subscribe({ table: 'held_bills', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.heldBills(activeStoreId) })),
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
      onPosEvent('pos:inventory-adjusted', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.inventory(activeStoreId) })),
      onPosEvent('pos:stock-deducted', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.inventory(activeStoreId) })),
      onPosEvent('pos:recipe-updated', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.recipes(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.inventory(activeStoreId) });
      }),

      onPosEvent('pos:menu-updated', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.menuItems(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.categories(activeStoreId) });
      }),
      onPosEvent('pos:order-created', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orders(activeStoreId) })),
      onPosEvent('pos:order-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orders(activeStoreId) })),
      onPosEvent('pos:order-completed', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orders(activeStoreId) })),
      onPosEvent('pos:order-cancelled', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orders(activeStoreId) })),
      onPosEvent('pos:customer-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.customers(merchantId) })),
      onPosEvent('pos:products-updated', () =>
        queryClient.invalidateQueries({ queryKey: ['pos', 'products'] })),
      // Slice 5: Tables + KOT typed events → cache invalidation only. No
      // global refresh; each event narrows to its own store-scoped key.
      onPosEvent('pos:table-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tables(activeStoreId) })),
      onPosEvent('pos:table-status-changed', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tables(activeStoreId) })),
      onPosEvent('pos:kot-created', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.kot(activeStoreId) })),
      onPosEvent('pos:kot-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.kot(activeStoreId) })),
      onPosEvent('pos:kot-completed', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.kot(activeStoreId) })),
      onPosEvent('pos:kot-cancelled', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.kot(activeStoreId) })),
      // Slice 6: Held Bills + Offline Sync typed events → cache invalidation.
      onPosEvent('pos:heldbill-created', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.heldBills(activeStoreId) })),
      onPosEvent('pos:heldbill-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.heldBills(activeStoreId) })),
      onPosEvent('pos:heldbill-deleted', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.heldBills(activeStoreId) })),
      onPosEvent('pos:sync-completed', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.offlineQueue() });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.heldBills(activeStoreId) });
      }),
      onPosEvent('pos:sync-failed', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.offlineQueue() })),
      onPosEvent('pos:queue-updated', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.offlineQueue() })),
    ];
    return () => offs.forEach((o) => o());
  }, [queryClient, activeStoreId, merchantId]);

  // Slice 6: Bridge legacy window events (`pos:queue-drained`, `online`,
  // `offline`) into the typed pos: event bus so consumers only need one API.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDrained = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      window.dispatchEvent(new CustomEvent('pos:sync-completed', {
        detail: { storeId: activeStoreId, drained: detail.count },
      }));
      window.dispatchEvent(new CustomEvent('pos:queue-updated', { detail: {} }));
    };
    const onOnline = () => window.dispatchEvent(new CustomEvent('pos:sync-started', {
      detail: { storeId: activeStoreId, reason: 'online' },
    }));
    window.addEventListener('pos:queue-drained', onDrained);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('pos:queue-drained', onDrained);
      window.removeEventListener('online', onOnline);
    };
  }, [activeStoreId]);


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

export function useCategoriesQuery(opts?: QOpts<Category[]>) {
  const { activeStoreId } = useStore();
  return useQuery<Category[]>({
    queryKey: posQueryKeys.categories(activeStoreId),
    queryFn: () => fetchCategories(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as Category[],
    ...opts,
  });
}
export function useMenuItemsQuery(opts?: QOpts<MenuItem[]>) {
  const { activeStoreId } = useStore();
  return useQuery<MenuItem[]>({
    queryKey: posQueryKeys.menuItems(activeStoreId),
    queryFn: () => fetchMenuItems(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as MenuItem[],
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
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as any[],
    ...opts,
  });
}

// Slice 3: Orders — single owner for the orders read path. Consumers should
// prefer this hook over ad-hoc `useCloudData('orders', ...)` calls so every
// mount hits the same cache and every realtime/event invalidation reaches
// every screen at once. Writes still flow through useSaveOrderMutation /
// useOrderSync; this hook is strictly the read + cache surface.
export function useOrdersQuery(opts?: QOpts<Order[]>) {
  const { activeStoreId } = useStore();
  return useQuery<Order[]>({
    queryKey: posQueryKeys.orders(activeStoreId),
    queryFn: () => fetchOrders(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as Order[],
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
// Slice 5: Tables — single owner for the restaurant tables read path.
// Consumers (POSContext mirror, TablesView, KOT panel, transfer dialog)
// should prefer this hook so every mount hits the same cache and every
// realtime/event invalidation reaches every screen at once. Writes still
// flow through useSaveCloudDataMutation('tables') / POSContext table ops.
export function useTablesQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.tables(activeStoreId),
    queryFn: () => fetchTables(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as any[],
    ...opts,
  });
}
// Slice 5: KOT — single owner for the kitchen order ticket read path.
// KOT generation logic (kot numbering, printing) is untouched and still
// lives in POSContext; this hook is strictly the read + cache surface for
// kitchen-facing consumers. Empty until a KOT surface subscribes.
export function useKOTQuery(opts?: QOpts<KOTTicket[]>) {
  const { activeStoreId } = useStore();
  return useQuery<KOTTicket[]>({
    queryKey: posQueryKeys.kot(activeStoreId),
    queryFn: () => fetchKOT(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as KOTTicket[],
    ...opts,
  });
}
// Slice 4: Inventory + Recipes — single owner for the inventory read path.
// Consumers should prefer these hooks over ad-hoc supabase queries so every
// mount hits the same cache and every realtime/event invalidation reaches
// every screen at once. Writes (adjustments, deductions, recipe edits) still
// flow through existing mutation code paths (useInventoryDeduction,
// useStoreDataSync, POSContext.reduceStock); these hooks are strictly the
// read + cache surface.
export function useInventoryQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.inventory(activeStoreId),
    queryFn: () => fetchInventory(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as any[],
    ...opts,
  });
}
export function useRecipesQuery(opts?: QOpts<RecipeComponent[]>) {
  const { activeStoreId } = useStore();
  return useQuery<RecipeComponent[]>({
    queryKey: posQueryKeys.recipes(activeStoreId),
    queryFn: () => fetchRecipes(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as RecipeComponent[],
    ...opts,
  });
}

// Slice 6: Held Bills — single owner for the held-bills read path. Consumers
// should prefer this hook over ad-hoc useCloudData('held_bills', ...) calls
// so every mount hits the same cache and every realtime/event invalidation
// reaches every screen at once. Writes still flow through POSContext
// (holdBill / mergeBills / deleteHeldBill) which emits pos:heldbill-* events.
export function useHeldBillsQuery(opts?: QOpts<HeldBill[]>) {
  const { activeStoreId } = useStore();
  return useQuery<HeldBill[]>({
    queryKey: posQueryKeys.heldBills(activeStoreId),
    queryFn: () => fetchHeldBills(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as HeldBill[],
    ...opts,
  });
}

// Slice 6: Offline Queue — single reader surface over the existing sync
// engine (src/lib/syncQueue + src/lib/syncEngine). Wraps queueStats +
// listPoisoned into one React Query cache so every panel/badge reads from
// one place. Auto-invalidates on pos:sync-* and pos:queue-updated events
// (bridged from legacy `pos:queue-drained`/`online` in the provider above).
// Engine internals (retry, backoff, persistence, leader lock, conflict
// resolution) are unchanged — this hook is strictly the read + control
// surface.
export interface OfflineQueueSnapshot {
  stats: Awaited<ReturnType<typeof queueStats>> | null;
  poisoned: Awaited<ReturnType<typeof listPoisoned>>;
  pending: number;
  processing: number;
  failed: number;
  isOnline: boolean;
}
async function fetchOfflineQueue(): Promise<OfflineQueueSnapshot> {
  const [stats, poisoned] = await Promise.all([queueStats(), listPoisoned()]);
  return {
    stats,
    poisoned,
    pending: (stats as any)?.pending ?? 0,
    processing: (stats as any)?.processing ?? 0,
    failed: poisoned.length,
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  };
}
export function useOfflineQueue(opts?: QOpts<OfflineQueueSnapshot>) {
  const queryClient = useQueryClient();
  const query = useQuery<OfflineQueueSnapshot>({
    queryKey: posQueryKeys.offlineQueue(),
    queryFn: fetchOfflineQueue,
    staleTime: 3_000,
    refetchInterval: 10_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: {
      stats: null, poisoned: [], pending: 0, processing: 0, failed: 0,
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    },
    ...opts,
  });
  const retry = useCallback(async (id: number) => {
    await retryPoisoned(id);
    await queryClient.invalidateQueries({ queryKey: posQueryKeys.offlineQueue() });
  }, [queryClient]);
  const discard = useCallback(async (id: number) => {
    await discardPoisoned(id);
    await queryClient.invalidateQueries({ queryKey: posQueryKeys.offlineQueue() });
  }, [queryClient]);
  const refresh = useCallback(() =>
    queryClient.invalidateQueries({ queryKey: posQueryKeys.offlineQueue() }),
    [queryClient]);
  return { ...query, retry, discard, refresh };
}


