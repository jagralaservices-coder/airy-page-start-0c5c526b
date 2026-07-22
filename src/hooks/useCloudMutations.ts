import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentStoreId, getCurrentStoreCode } from './useCloudData';
import { Order, MenuItem, InventoryItem } from '@/lib/store';
import { toUUID } from './useOrderSync'; // Assuming we keep toUUID or move it to a util file

// Generic edge function call for mutations
export const mutateCloudData = async (action: 'save' | 'delete' | 'update', dataType: string, payload: any) => {
  if (localStorage.getItem('pos_login_as_demo') === 'true') return null;
  const storeId = getCurrentStoreId();
  if (!storeId) {
    console.warn('[mutateCloudData] Skipped: no active store_id', { action, dataType });
    return { skipped: true, reason: 'no_store_id' };
  }

  const body: any = { action, store_id: storeId, data_type: dataType, ...payload };
  const storeCode = getCurrentStoreCode();
  if (storeCode) body.store_code = storeCode;

  const { data, error } = await supabase.functions.invoke('sync-store-data', { body });
  
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  
  return data;
};

export const useSaveOrderMutation = () => {
  const queryClient = useQueryClient();
  const storeId = getCurrentStoreId();

  return useMutation({
    mutationFn: async (orders: Order[]) => {
      // Re-resolve at call time to avoid stale null captured at hook init
      const activeStoreId = getCurrentStoreId();
      if (!activeStoreId) {
        console.warn('[useSaveOrderMutation] Skipped: no active store_id');
        return { skipped: true, reason: 'no_store_id' };
      }
      if (!orders || orders.length === 0) {
        return { skipped: true, reason: 'no_orders' };
      }
      const storeCode = getCurrentStoreCode();
      // Optional Cashier Billing Module — tag bills if a cashier session exists.
      let cashierTag: any = null;
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('maxora_cashier_session_v1') : null;
        if (raw) {
          const s = JSON.parse(raw);
          if (s?.storeId === activeStoreId) {
            cashierTag = {
              cashier_id: s.cashierId,
              cashier_name: s.cashierName,
              cashier_shift_id: s.shiftId,
              device_name: s.deviceName,
            };
          }
        }
      } catch {}
      const functionOrders = orders.map((order: any) => ({
        ...order,
        store_id: activeStoreId,
        ...(cashierTag || {}),
        paymentDetails: order.paymentBreakdown || order.payment_breakdown 
          ? { breakdown: order.paymentBreakdown || order.payment_breakdown } 
          : (order.paymentDetails || order.payment_details || null),
      }));

      const { data, error } = await supabase.functions.invoke('sync-orders', {
        body: { action: 'save', store_id: activeStoreId, store_code: storeCode, orders: functionOrders }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Legacy cloudData cache
      queryClient.invalidateQueries({ queryKey: ['cloudData', storeId, 'orders'] });
      // Slice 3: POSDataContext shared cache + typed event bus so every
      // consumer (owner dashboard, cashier billing, order lists) refreshes
      // from the single source of truth.
      queryClient.invalidateQueries({ queryKey: ['pos', 'orders', storeId] });
      try {
        window.dispatchEvent(new CustomEvent('pos:order-updated', { detail: { storeId } }));
      } catch {}
    },
  });
};

export const useUpdateOrderMutation = () => {
  const queryClient = useQueryClient();
  const storeId = getCurrentStoreId();

  return useMutation({
    mutationFn: async ({ orderId, updates }: { orderId: string, updates: any }) => {
      // For updates, we can either re-save the whole order or just update status via direct supabase call (if admin)
      // For now, let's use the edge function save with just the updated order
      // Assuming POSContext will provide the full order object.
      // Wait, direct edge function for update? The sync-orders edge function only has 'save' and 'fetch'.
      // If we just upsert the whole order via saveOrderMutation, it handles updates.
      throw new Error('Not implemented: use useSaveOrderMutation instead');
    },
  });
};

// Slice 1 + Slice 2 bridge: cross-invalidate the POSDataContext React Query
// cache (['pos', <slice>, storeId]) whenever legacy cloudData mutations touch
// menu_items, categories, or products. Emits typed pos: events so every
// consumer refreshes without a manual signal.
const crossInvalidateSlice1 = (
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string | null,
  dataType: string,
) => {
  queryClient.invalidateQueries({ queryKey: ['cloudData', storeId, dataType] });
  if (dataType === 'menu_items') {
    queryClient.invalidateQueries({ queryKey: ['pos', 'menu-items', storeId] });
  } else if (dataType === 'categories') {
    queryClient.invalidateQueries({ queryKey: ['pos', 'categories', storeId] });
  } else if (dataType === 'products') {
    // Slice 2: products cache is keyed by (merchantId, storeId). Invalidate
    // the whole products namespace so every merchant scope refreshes.
    queryClient.invalidateQueries({ queryKey: ['pos', 'products'] });
  } else if (dataType === 'inventory' || dataType === 'inventory_items') {
    // Slice 4: inventory + recipes share the same store scope.
    queryClient.invalidateQueries({ queryKey: ['pos', 'inventory', storeId] });
    queryClient.invalidateQueries({ queryKey: ['pos', 'recipes', storeId] });
  } else if (dataType === 'inventory_components' || dataType === 'recipes') {
    queryClient.invalidateQueries({ queryKey: ['pos', 'recipes', storeId] });
    queryClient.invalidateQueries({ queryKey: ['pos', 'inventory', storeId] });
  } else if (dataType === 'tables' || dataType === 'restaurant_tables') {
    // Slice 5: tables share a single POSDataContext cache.
    queryClient.invalidateQueries({ queryKey: ['pos', 'tables', storeId] });
  } else if (dataType === 'kot' || dataType === 'kot_tickets' || dataType === 'kot_items') {
    // Slice 5: KOT cache. KOT generation still lives in POSContext, so this
    // path exists for future kitchen mutation sites without changing them.
    queryClient.invalidateQueries({ queryKey: ['pos', 'kot', storeId] });
  } else if (dataType === 'held_bills') {
    // Slice 6: Held bills share a single POSDataContext cache.
    queryClient.invalidateQueries({ queryKey: ['pos', 'held-bills', storeId] });
  } else if (dataType === 'pos_customers' || dataType === 'customers') {
    // Slice 7: Customers cache is merchant-scoped; invalidate the whole
    // customers namespace so every merchant scope refreshes.
    queryClient.invalidateQueries({ queryKey: ['pos', 'customers'] });
  } else if (dataType === 'credit_ledger') {
    queryClient.invalidateQueries({ queryKey: ['pos', 'credit-ledger', storeId] });
  } else if (dataType === 'credit_payments') {
    queryClient.invalidateQueries({ queryKey: ['pos', 'credit-payments', storeId] });
    queryClient.invalidateQueries({ queryKey: ['pos', 'credit-ledger', storeId] });
  }
  if (dataType === 'held_bills') {
    try {
      window.dispatchEvent(new CustomEvent('pos:heldbill-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'menu_items' || dataType === 'categories') {
    try {
      window.dispatchEvent(new CustomEvent('pos:menu-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'products') {
    try {
      window.dispatchEvent(new CustomEvent('pos:products-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'inventory' || dataType === 'inventory_items') {
    try {
      window.dispatchEvent(new CustomEvent('pos:inventory-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'inventory_components' || dataType === 'recipes') {
    try {
      window.dispatchEvent(new CustomEvent('pos:recipe-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'tables' || dataType === 'restaurant_tables') {
    try {
      window.dispatchEvent(new CustomEvent('pos:table-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'kot' || dataType === 'kot_tickets' || dataType === 'kot_items') {
    try {
      window.dispatchEvent(new CustomEvent('pos:kot-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'pos_customers' || dataType === 'customers') {
    try {
      window.dispatchEvent(new CustomEvent('pos:customer-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'credit_ledger') {
    try {
      window.dispatchEvent(new CustomEvent('pos:credit-updated', { detail: { storeId } }));
    } catch {}
  }
  if (dataType === 'credit_payments') {
    try {
      window.dispatchEvent(new CustomEvent('pos:credit-payment-added', { detail: { storeId } }));
    } catch {}
  }
};



// Generic mutation for store data (inventory, expenses, held_bills, categories, pos_customers)
export const useSaveCloudDataMutation = (dataType: string) => {
  const queryClient = useQueryClient();
  const storeId = getCurrentStoreId();

  return useMutation({
    mutationFn: async (items: any[]) => {
      return mutateCloudData('save', dataType, { items });
    },
    onSuccess: () => {
      crossInvalidateSlice1(queryClient, storeId, dataType);
    },
  });
};

export const useUpdateCloudDataMutation = (dataType: string) => {
  const queryClient = useQueryClient();
  const storeId = getCurrentStoreId();

  return useMutation({
    mutationFn: async (payload: { item_id: string, updates: any, ingredients?: any[], variations?: any[] }) => {
      return mutateCloudData('update', dataType, payload);
    },
    onSuccess: () => {
      crossInvalidateSlice1(queryClient, storeId, dataType);
    },
  });
};

export const useDeleteCloudDataMutation = (dataType: string) => {
  const queryClient = useQueryClient();
  const storeId = getCurrentStoreId();

  return useMutation({
    mutationFn: async (itemIds: string[]) => {
      return mutateCloudData('delete', dataType, { item_ids: itemIds });
    },
    onSuccess: () => {
      crossInvalidateSlice1(queryClient, storeId, dataType);
    },
  });
};
