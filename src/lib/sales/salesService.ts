// Canonical sale write path (online-first).
//
// Every completed bill goes through `create-sale`, which runs the atomic
// `create_sale_tx` transaction in the database. The cloud row is the single
// source of truth; localStorage/IndexedDB are only a temporary buffer used
// when the device is genuinely offline.

import { supabase } from '@/integrations/supabase/client';
import { getCurrentStoreId, getCurrentStoreCode } from '@/lib/storeIdentity';
import type { Order } from '@/lib/store';

export interface SalePayload {
  id: string;
  client_transaction_id: string;
  bill_number?: string;
  items: { id?: string; name?: string; price: number; quantity: number }[];
  discount?: number;
  tax?: number;
  order_type?: string;
  table_number?: string | number | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_method?: string;
  payment_details?: any;
  payment_breakdown?: any;
  status?: string;
  cashier_id?: string | null;
  cashier_name?: string | null;
  cashier_shift_id?: string | null;
  device_name?: string | null;
  created_at?: string;
}

export interface CreateSaleResult {
  ok: boolean;
  /** authoritative order row returned by the database */
  order?: any;
  /** true when the write could not reach the cloud and must be buffered */
  offline?: boolean;
  error?: string;
}

/** Cashier tag from the optional Cashier Billing module. */
const readCashierTag = (storeId: string) => {
  try {
    const raw = typeof window !== 'undefined'
      ? localStorage.getItem('maxora_cashier_session_v1') : null;
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s?.storeId !== storeId) return null;
    return {
      cashier_id: s.cashierId ?? null,
      cashier_name: s.cashierName ?? null,
      cashier_shift_id: s.shiftId ?? null,
      device_name: s.deviceName ?? null,
    };
  } catch {
    return null;
  }
};

/** Map the in-app Order shape onto the DB payload contract. */
export const toSalePayload = (order: Order & Record<string, any>, storeId: string): SalePayload => {
  const cashier = readCashierTag(storeId);
  return {
    id: order.id,
    // The order id doubles as the idempotency key: a retried or double-clicked
    // sale can never create a second bill.
    client_transaction_id: order.clientTransactionId || order.id,
    bill_number: order.billNumber,
    items: (order.items || []).map((i: any) => ({
      id: i.id ?? i.menuItemId ?? null,
      name: i.name ?? null,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1,
      ...(i.variation ? { variation: i.variation } : {}),
      ...(i.notes ? { notes: i.notes } : {}),
    })),
    discount: Number(order.discount) || 0,
    tax: Number(order.tax) || 0,
    order_type: order.orderType,
    table_number: order.tableNumber ?? null,
    customer_id: order.customerId ?? null,
    customer_name: order.customerName ?? null,
    customer_phone: order.customerPhone ?? null,
    payment_method: order.paymentMethod,
    payment_details: order.paymentDetails ?? null,
    payment_breakdown: order.paymentBreakdown ?? null,
    status: order.status || 'completed',
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
    ...(cashier || {}),
  };
};

/**
 * Record a sale in the cloud. Returns the authoritative order row.
 * Never throws — callers decide how to buffer when `offline` is true.
 */
export const createSaleOnCloud = async (
  order: Order & Record<string, any>,
): Promise<CreateSaleResult> => {
  if (typeof window !== 'undefined' && localStorage.getItem('pos_login_as_demo') === 'true') {
    return { ok: true, order: null };
  }

  const storeId = order.storeId || getCurrentStoreId();
  if (!storeId) return { ok: false, offline: true, error: 'No active store' };

  try {
    const { data, error } = await supabase.functions.invoke('create-sale', {
      body: {
        store_id: storeId,
        store_code: getCurrentStoreCode() || undefined,
        sale: toSalePayload(order, storeId),
      },
    });

    if (error) {
      return { ok: false, offline: true, error: error.message };
    }
    if (!data?.success) {
      return { ok: false, offline: false, error: data?.message || data?.error || 'Sale rejected' };
    }
    return { ok: true, order: data.order };
  } catch (e: any) {
    return { ok: false, offline: true, error: e?.message || 'Network error' };
  }
};

/** Cancel a bill server-side with optimistic-concurrency checking. */
export const cancelSaleOnCloud = async (
  orderId: string,
  reason: string,
  expectedVersion?: number | null,
): Promise<CreateSaleResult> => {
  try {
    const { data, error } = await supabase.rpc('cancel_sale' as any, {
      _order_id: orderId,
      _reason: reason,
      _expected_version: expectedVersion ?? null,
    });
    if (error) {
      const conflict = error.message?.includes('VERSION_CONFLICT');
      return { ok: false, offline: !conflict, error: error.message };
    }
    return { ok: true, order: Array.isArray(data) ? data[0] : data };
  } catch (e: any) {
    return { ok: false, offline: true, error: e?.message || 'Network error' };
  }
};

/** Edit a bill server-side (totals are recalculated in the database). */
export const editSaleOnCloud = async (
  orderId: string,
  patch: Record<string, any>,
  expectedVersion?: number | null,
): Promise<CreateSaleResult> => {
  try {
    const { data, error } = await supabase.rpc('edit_sale' as any, {
      _order_id: orderId,
      _patch: patch,
      _expected_version: expectedVersion ?? null,
    });
    if (error) {
      const conflict = error.message?.includes('VERSION_CONFLICT');
      return { ok: false, offline: !conflict, error: error.message };
    }
    return { ok: true, order: Array.isArray(data) ? data[0] : data };
  } catch (e: any) {
    return { ok: false, offline: true, error: e?.message || 'Network error' };
  }
};
