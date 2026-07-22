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
  // Slice 8: Expenses, Reports, Dashboard, Analytics.
  expenses: (storeId: string | null) => ['pos', 'expenses', storeId] as const,
  reports: (storeId: string | null, reportType: string, start: string, end: string, extra?: string) =>
    ['pos', 'reports', storeId, reportType, start, end, extra ?? ''] as const,
  dashboard: (storeId: string | null, range: string) => ['pos', 'dashboard', storeId, range] as const,
  analyticsSummary: (storeId: string | null, range: string) =>
    ['pos', 'analytics', storeId, range] as const,
  // Slice 9: Staff / Attendance / Leaves / Shifts / Payroll read models.
  staff: (merchantId: string | null, storeId: string | null) =>
    ['pos', 'staff', merchantId, storeId] as const,
  attendance: (storeId: string | null, range?: string) =>
    ['pos', 'attendance', storeId, range ?? 'all'] as const,
  leaves: (merchantId: string | null, storeId: string | null) =>
    ['pos', 'leaves', merchantId, storeId] as const,
  shifts: (storeId: string | null) => ['pos', 'shifts', storeId] as const,
  payroll: (merchantId: string | null, storeId: string | null, period?: string) =>
    ['pos', 'payroll', merchantId, storeId, period ?? 'current'] as const,
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
// Slice 8: Expenses — store-scoped rows via sync-store-data edge function
// so payload shape / RLS behaviour is identical to legacy useCloudData path.
async function fetchExpenses(storeId: string): Promise<any[]> {
  const storeCode = getCurrentStoreCode();
  const data = await fetchCloudData('expenses', storeId, storeCode);
  return (data?.items || []) as any[];
}

// ---------------------------------------------------------------------------
// Slice 9: Staff / Attendance / Leaves / Shifts / Payroll — read models only.
// Write paths (create/update/delete staff, check-in/out, leave approvals,
// payroll runs) continue to live in their existing hooks / edge functions.
// Face verification, GPS, geo-fencing, camera and check-in/out business logic
// are intentionally untouched — these fetchers are strictly the read + cache
// surface consumers should prefer over ad-hoc supabase queries.
// ---------------------------------------------------------------------------
async function fetchStaff(merchantId: string, storeId: string | null): Promise<any[]> {
  let q: any = supabase.from('staff').select('*').eq('merchant_id', merchantId);
  if (storeId) q = q.eq('store_id', storeId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any[];
}
async function fetchAttendance(storeId: string, range?: { start: string; end: string }): Promise<any[]> {
  let q: any = supabase.from('staff_attendance').select('*').eq('store_id', storeId);
  if (range?.start) q = q.gte('date', range.start);
  if (range?.end) q = q.lte('date', range.end);
  const { data, error } = await q.order('date', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data || []) as any[];
}
async function fetchLeaves(merchantId: string, storeId: string | null): Promise<any[]> {
  // leave_requests may not be present in generated types on every project;
  // cast to any so this compiles regardless while remaining runtime-safe.
  let q: any = (supabase as any).from('leave_requests').select('*');
  if (storeId) q = q.eq('store_id', storeId);
  else q = q.eq('merchant_id', merchantId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
  if (error) {
    // Missing table / permission → return empty rather than throwing so pages
    // that mount this hook stay usable on projects without the leave schema.
    console.warn('[POSDataContext] fetchLeaves suppressed error:', error?.message);
    return [];
  }
  return (data || []) as any[];
}
async function fetchShifts(storeId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('cashier_shifts')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as any[];
}
async function fetchPayroll(
  merchantId: string,
  storeId: string | null,
  period?: string,
): Promise<any[]> {
  // Payroll table isn't guaranteed on every project (may live in a future
  // schema or be computed off staff_attendance). Attempt the read and fall
  // back to [] so consumers can render an empty state gracefully.
  try {
    let q: any = (supabase as any).from('payroll').select('*');
    if (storeId) q = q.eq('store_id', storeId);
    else q = q.eq('merchant_id', merchantId);
    if (period) q = q.eq('period', period);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
    if (error) {
      console.warn('[POSDataContext] fetchPayroll suppressed error:', error?.message);
      return [];
    }
    return (data || []) as any[];
  } catch (e: any) {
    console.warn('[POSDataContext] fetchPayroll threw:', e?.message);
    return [];
  }
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
      // Slice 7: Customers — merchant-scoped. pos_customers.merchant_id filter
      // keeps cross-store noise off the channel. RealtimeContext dedupes so
      // repeat mounts share one connection.
      ...(merchantId ? [
        realtime.subscribe(
          { table: 'pos_customers', filter: `merchant_id=eq.${merchantId}` },
          () => queryClient.invalidateQueries({ queryKey: posQueryKeys.customers(merchantId) }),
        ),
      ] : []),
      // Slice 7: Credit Ledger + Credit Payments — store-scoped invalidation
      // hits both caches when either table changes so balance stays consistent.
      realtime.subscribe({ table: 'credit_ledger', filter }, () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditLedger(activeStoreId) });
      }),
      realtime.subscribe({ table: 'credit_payments', filter }, () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditPayments(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditLedger(activeStoreId) });
      }),
      // Slice 8: Expenses — store-scoped. Changes also invalidate derived
      // dashboard/analytics caches so KPIs recompute from one source.
      realtime.subscribe({ table: 'expenses', filter }, () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.expenses(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: ['pos', 'dashboard', activeStoreId] });
        queryClient.invalidateQueries({ queryKey: ['pos', 'analytics', activeStoreId] });
        queryClient.invalidateQueries({ queryKey: ['pos', 'reports', activeStoreId] });
      }),
      // Slice 9: Staff / Attendance / Leaves / Shifts / Payroll — realtime
      // read-model invalidation only. Business logic (check-in, face
      // verification, GPS, leave approval, payroll runs) is untouched.
      // `staff` and `leave_requests` are merchant-scoped in schema; we
      // subscribe without a store filter and let the cache key scope reads.
      ...(merchantId ? [
        realtime.subscribe({ table: 'staff', filter: `merchant_id=eq.${merchantId}` }, () =>
          queryClient.invalidateQueries({ queryKey: ['pos', 'staff', merchantId] })),
        realtime.subscribe({ table: 'leave_requests' as any, filter: `merchant_id=eq.${merchantId}` }, () =>
          queryClient.invalidateQueries({ queryKey: ['pos', 'leaves', merchantId] })),
        realtime.subscribe({ table: 'payroll' as any, filter: `merchant_id=eq.${merchantId}` }, () =>
          queryClient.invalidateQueries({ queryKey: ['pos', 'payroll', merchantId] })),
      ] : []),
      realtime.subscribe({ table: 'staff_attendance', filter }, () =>
        queryClient.invalidateQueries({ queryKey: ['pos', 'attendance', activeStoreId] })),
      realtime.subscribe({ table: 'cashier_shifts', filter }, () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.shifts(activeStoreId) })),
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
      onPosEvent('pos:customer-created', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.customers(merchantId) })),
      onPosEvent('pos:customer-deleted', () =>
        queryClient.invalidateQueries({ queryKey: posQueryKeys.customers(merchantId) })),
      // Slice 7: Credit typed events → cache invalidation only.
      onPosEvent('pos:credit-updated', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditLedger(activeStoreId) });
      }),
      onPosEvent('pos:credit-payment-added', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditPayments(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditLedger(activeStoreId) });
      }),
      onPosEvent('pos:credit-cleared', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditLedger(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.creditPayments(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: posQueryKeys.customers(merchantId) });
      }),
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
      // Slice 8: Expenses + derived reports/dashboard/analytics.
      onPosEvent('pos:expense-updated', () => {
        queryClient.invalidateQueries({ queryKey: posQueryKeys.expenses(activeStoreId) });
        queryClient.invalidateQueries({ queryKey: ['pos', 'dashboard', activeStoreId] });
        queryClient.invalidateQueries({ queryKey: ['pos', 'analytics', activeStoreId] });
        queryClient.invalidateQueries({ queryKey: ['pos', 'reports', activeStoreId] });
      }),
      onPosEvent('pos:reports-refreshed', () => {
        queryClient.invalidateQueries({ queryKey: ['pos', 'reports', activeStoreId] });
        queryClient.invalidateQueries({ queryKey: ['pos', 'dashboard', activeStoreId] });
      }),
      // Order lifecycle events also affect derived report/dashboard caches.
      onPosEvent('pos:order-completed', () => {
        queryClient.invalidateQueries({ queryKey: ['pos', 'dashboard', activeStoreId] });
        queryClient.invalidateQueries({ queryKey: ['pos', 'analytics', activeStoreId] });
        queryClient.invalidateQueries({ queryKey: ['pos', 'reports', activeStoreId] });
      }),
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


// Slice 7: Customers — single owner for the pos_customers read path.
// Merchant-scoped so cashier/owner across all stores read from one cache.
// Realtime + typed events fan out from POSDataProvider.
export function useCustomersQuery(opts?: QOpts<any[]>) {
  const { merchantId } = useMerchant();
  return useQuery({
    queryKey: posQueryKeys.customers(merchantId),
    queryFn: () => fetchCustomers(merchantId!),
    enabled: !!merchantId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as any[],
    ...opts,
  });
}

// Slice 7: Credit Ledger — single owner for credit_ledger reads. Store-scoped
// so balances match the active store. Writes still flow through POSContext
// credit helpers / useSaveCloudDataMutation('credit_ledger'); this is strictly
// the read + cache surface.
export function useCreditLedgerQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.creditLedger(activeStoreId),
    queryFn: () => fetchCreditLedger(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as any[],
    ...opts,
  });
}

// Slice 7: Credit Payments — single owner for credit_payments reads.
// Store-scoped. Consumers can derive per-ledger payment history from this
// cache without a second fetch.
export function useCreditPaymentsQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.creditPayments(activeStoreId),
    queryFn: () => fetchCreditPayments(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as any[],
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



// ---------------------------------------------------------------------------
// Slice 8: Expenses, Reports, Dashboard, Analytics
// ---------------------------------------------------------------------------

// Expenses — single owner for the expenses read path. Consumers should prefer
// this hook over ad-hoc useCloudData('expenses', ...) calls so every mount
// hits the same cache and every realtime/event invalidation reaches every
// screen at once. Writes still flow through useSaveCloudDataMutation('expenses')
// / POSContext expense helpers; this hook is strictly the read + cache surface.
export function useExpensesQuery(opts?: QOpts<any[]>) {
  const { activeStoreId } = useStore();
  return useQuery({
    queryKey: posQueryKeys.expenses(activeStoreId),
    queryFn: () => fetchExpenses(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    initialData: [] as any[],
    ...opts,
  });
}

// Reports — thin cache wrapper around the report RPCs. Each (reportType,
// dateRange) tuple gets its own cache entry so multiple report panels
// mounted concurrently share results and dedupe fetches. Realtime + typed
// events (orders, expenses) invalidate the whole ['pos','reports',storeId]
// namespace so numbers stay consistent without imperative refetch.
export interface ReportRange { start: Date; end: Date }
async function fetchReportRpc(
  reportType: string,
  storeId: string,
  range: ReportRange,
  extra?: { granularity?: string; customerId?: string },
): Promise<any> {
  const startDate = range.start.toISOString().split('T')[0];
  const endDate = range.end.toISOString().split('T')[0];
  const fnMap: Record<string, string> = {
    pl: 'get_pl_report',
    salesTrend: 'get_sales_trends',
    hourly: 'get_hourly_sales',
    customer: 'get_customer_analytics',
    table: 'get_table_performance',
    orderBehavior: 'get_order_behavior',
    payment: 'get_payment_breakdown',
    tax: 'get_tax_report',
    discount: 'get_discount_report',
    lossControl: 'get_loss_control_report',
    itemPerformance: 'get_item_performance',
    retention: 'get_customer_retention',
    targetAchievement: 'get_target_achievement',
    kitchen: 'get_kitchen_performance',
    delivery: 'get_delivery_performance',
    invoice: 'get_invoice_report',
  };
  if (reportType === 'multiOutlet') {
    const { data, error } = await (supabase as any).rpc('get_multi_outlet_report', {
      p_customer_id: extra?.customerId || storeId,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw error;
    return data;
  }
  const fnName = fnMap[reportType];
  if (!fnName) return null;
  const params: any = { p_store_id: storeId, p_start_date: startDate, p_end_date: endDate };
  if (reportType === 'salesTrend' && extra?.granularity) params.p_granularity = extra.granularity;
  const { data, error } = await (supabase as any).rpc(fnName, params);
  if (error) throw error;
  return data;
}
export function useReportsQuery(
  reportType: string | null,
  range: ReportRange | null,
  extra?: { granularity?: string; customerId?: string },
  opts?: QOpts<any>,
) {
  const { activeStoreId } = useStore();
  const startKey = range?.start.toISOString().split('T')[0] ?? '';
  const endKey = range?.end.toISOString().split('T')[0] ?? '';
  const extraKey = extra?.granularity || extra?.customerId || '';
  return useQuery({
    queryKey: posQueryKeys.reports(activeStoreId, reportType ?? '', startKey, endKey, extraKey),
    queryFn: () => fetchReportRpc(reportType!, activeStoreId!, range!, extra),
    enabled: !!activeStoreId && !!reportType && !!range,
    staleTime: 30_000,
    // Reports are expensive — do NOT poll; rely on typed-event invalidation.
    refetchOnWindowFocus: false,
    ...opts,
  });
}

// Dashboard — derived KPI snapshot computed from the shared orders + expenses
// caches. Zero extra fetches: `select` runs against React Query's existing
// data so consumers subscribe to one cache and derive their own view.
export interface DashboardSnapshot {
  totalSales: number;
  totalOrders: number;
  totalExpenses: number;
  netProfit: number;
  avgOrderValue: number;
  cashSales: number;
  cardSales: number;
  upiSales: number;
  dueSales: number;
}
function rangeFilter(range: 'today' | 'week' | 'month' | 'all'): (d: Date) => boolean {
  if (range === 'all') return () => true;
  const now = new Date();
  const start = new Date(now);
  if (range === 'today') start.setHours(0, 0, 0, 0);
  else if (range === 'week') { start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); }
  else if (range === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  return (d: Date) => d >= start;
}
export function useDashboardQuery(range: 'today' | 'week' | 'month' | 'all' = 'today') {
  const { activeStoreId } = useStore();
  const orders = useOrdersQuery();
  const expenses = useExpensesQuery();
  return useMemo<DashboardSnapshot>(() => {
    const inRange = rangeFilter(range);
    const os = (orders.data || []).filter((o: any) => {
      const t = new Date(o.createdAt || o.created_at || 0);
      return inRange(t) && (o.status !== 'cancelled');
    });
    const es = (expenses.data || []).filter((e: any) => inRange(new Date(e.date || e.created_at || 0)));
    const totalSales = os.reduce((s, o: any) => s + Number(o.total || 0), 0);
    const totalExpenses = es.reduce((s, e: any) => s + Number(e.amount || 0), 0);
    const totalOrders = os.length;
    const sumBy = (m: string) => os
      .filter((o: any) => (o.paymentMethod || o.payment_method) === m)
      .reduce((s, o: any) => s + Number(o.total || 0), 0);
    return {
      totalSales,
      totalOrders,
      totalExpenses,
      netProfit: totalSales - totalExpenses,
      avgOrderValue: totalOrders ? totalSales / totalOrders : 0,
      cashSales: sumBy('cash'),
      cardSales: sumBy('card'),
      upiSales: sumBy('upi'),
      dueSales: sumBy('due'),
    };
  }, [orders.data, expenses.data, range, activeStoreId]);
}

// Analytics summary — same shape/model as useAnalytics but sourced from the
// shared cache so multiple analytics panels don't each trigger their own
// fetch. This is intentionally a derived selector, not a new fetch.
export function useAnalyticsSummaryQuery(range: 'today' | 'week' | 'month' | 'all' = 'today') {
  return useDashboardQuery(range);
}
