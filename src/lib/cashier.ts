/**
 * Cashier Billing Module — client utilities & local session.
 *
 * This module is OPTIONAL. When `cashier_billing_mode` is OFF for the active
 * store, MAXORA behaves exactly as before. When ON, only billing screens
 * require a cashier PIN session in addition to the normal store/staff login.
 *
 * Staff Module, Attendance, Payroll, HR — NOT touched here. Cashier is for
 * billing operations only.
 */
import { supabase } from '@/integrations/supabase/client';

export interface CashierPermissions {
  manualDiscount: boolean;
  billVoid: boolean;
  billReturn: boolean;
  reprintBill: boolean;
  priceEdit: boolean;
  itemDelete: boolean;
  cashDrawer: boolean;
  customerCreation: boolean;
}

export const DEFAULT_CASHIER_PERMISSIONS: CashierPermissions = {
  manualDiscount: true,
  billVoid: false,
  billReturn: false,
  reprintBill: true,
  priceEdit: false,
  itemDelete: true,
  cashDrawer: true,
  customerCreation: true,
};

export interface CashierRecord {
  id: string;
  store_id: string;
  cashier_code: string;
  name: string;
  photo_url: string | null;
  is_active: boolean;
  permissions: CashierPermissions;
  created_at?: string;
  updated_at?: string;
}

export interface CashierSession {
  cashierId: string;
  cashierCode: string;
  cashierName: string;
  storeId: string;
  shiftId: string;
  photoUrl: string | null;
  permissions: CashierPermissions;
  loginAt: string;
  deviceName: string;
}

const SESSION_KEY = 'maxora_cashier_session_v1';
const MODE_KEY_PREFIX = 'maxora_cashier_billing_mode_'; // + storeId

// ---------- Mode toggle ----------
export function isCashierBillingModeOn(storeId: string | null | undefined): boolean {
  if (!storeId) return false;
  try {
    return localStorage.getItem(MODE_KEY_PREFIX + storeId) === '1';
  } catch {
    return false;
  }
}

export function setCashierBillingModeLocal(storeId: string, on: boolean) {
  try {
    localStorage.setItem(MODE_KEY_PREFIX + storeId, on ? '1' : '0');
  } catch {}
}

export async function setCashierBillingMode(storeId: string, on: boolean) {
  setCashierBillingModeLocal(storeId, on);
  const { error } = await supabase
    .from('stores')
    .update({ cashier_billing_mode: on })
    .eq('id', storeId);
  if (error) throw error;
}

export async function loadCashierBillingMode(storeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('stores')
    .select('cashier_billing_mode')
    .eq('id', storeId)
    .maybeSingle();
  if (error) return isCashierBillingModeOn(storeId);
  const on = !!(data as any)?.cashier_billing_mode;
  setCashierBillingModeLocal(storeId, on);
  return on;
}

// ---------- Session ----------
export function getCashierSession(): CashierSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CashierSession;
  } catch {
    return null;
  }
}

export function setCashierSession(s: CashierSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('cashier:session-changed', { detail: s }));
}

export function clearCashierSession() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent('cashier:session-changed', { detail: null }));
}

// ---------- CRUD ----------
export async function listCashiers(storeId: string): Promise<CashierRecord[]> {
  const { data, error } = await supabase
    .from('cashiers')
    .select('id,store_id,cashier_code,name,photo_url,is_active,permissions,created_at,updated_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    ...r,
    permissions: { ...DEFAULT_CASHIER_PERMISSIONS, ...(r.permissions || {}) },
  }));
}

export async function createCashier(input: {
  storeId: string;
  cashierCode: string;
  name: string;
  pin: string;
  photoUrl?: string | null;
  permissions?: Partial<CashierPermissions>;
}): Promise<string> {
  const merged = { ...DEFAULT_CASHIER_PERMISSIONS, ...(input.permissions || {}) };
  const { data, error } = await supabase.rpc('cashier_create', {
    _store_id: input.storeId,
    _cashier_code: input.cashierCode,
    _name: input.name,
    _pin: input.pin,
    _photo_url: input.photoUrl ?? null,
    _permissions: merged as any,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function updateCashier(id: string, patch: Partial<Pick<CashierRecord, 'name' | 'cashier_code' | 'photo_url' | 'is_active' | 'permissions'>>) {
  const { error } = await supabase.from('cashiers').update(patch as any).eq('id', id);
  if (error) throw error;
}

export async function resetCashierPin(id: string, newPin: string) {
  const { error } = await supabase.rpc('cashier_set_pin', { _cashier_id: id, _pin: newPin });
  if (error) throw error;
}

export async function deleteCashier(id: string) {
  const { error } = await supabase.from('cashiers').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Login / Shift ----------
export async function loginCashier(storeId: string, identifier: string, pin: string): Promise<CashierSession> {
  const { data, error } = await supabase.rpc('cashier_verify_pin', {
    _store_id: storeId,
    _identifier: identifier,
    _pin: pin,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) throw new Error('Invalid Cashier ID/Name or PIN');

  const deviceName = getDeviceName();
  // Open shift
  const { data: shift, error: shiftErr } = await supabase
    .from('cashier_shifts')
    .insert({ cashier_id: row.id, store_id: storeId, device_name: deviceName })
    .select('id')
    .single();
  if (shiftErr) throw shiftErr;

  const session: CashierSession = {
    cashierId: row.id,
    cashierCode: row.cashier_code,
    cashierName: row.name,
    storeId,
    shiftId: (shift as any).id,
    photoUrl: row.photo_url,
    permissions: { ...DEFAULT_CASHIER_PERMISSIONS, ...(row.permissions || {}) },
    loginAt: new Date().toISOString(),
    deviceName,
  };
  setCashierSession(session);
  await logCashierEvent('login', {});
  return session;
}

export async function logoutCashier() {
  const s = getCashierSession();
  if (!s) return;
  try {
    // Close shift, compute totals from orders for the shift
    const { data: orders } = await supabase
      .from('orders')
      .select('total,payment_method,status')
      .eq('cashier_shift_id', s.shiftId);
    const rows = (orders as any[]) || [];
    const billsCreated = rows.length;
    let cash = 0, upi = 0, card = 0, credit = 0, sales = 0, cancelled = 0;
    for (const r of rows) {
      const t = Number(r.total) || 0;
      if (r.status === 'cancelled') { cancelled += 1; continue; }
      sales += t;
      const m = (r.payment_method || '').toLowerCase();
      if (m.includes('cash')) cash += t;
      else if (m.includes('upi')) upi += t;
      else if (m.includes('card')) card += t;
      else if (m.includes('credit') || m.includes('due')) credit += t;
    }
    await supabase
      .from('cashier_shifts')
      .update({
        closed_at: new Date().toISOString(),
        bills_created: billsCreated,
        sales_amount: sales,
        cash_collected: cash,
        upi_collected: upi,
        card_collected: card,
        credit_sales: credit,
        cancelled_bills: cancelled,
      })
      .eq('id', s.shiftId);
    await logCashierEvent('logout', { billsCreated, sales });
  } catch (e) {
    console.error('Cashier logout shift close failed', e);
  } finally {
    clearCashierSession();
  }
}

// ---------- Audit ----------
export async function logCashierEvent(event: string, payload: Record<string, any> = {}) {
  const s = getCashierSession();
  if (!s) return;
  try {
    await supabase.from('cashier_audit_log').insert({
      cashier_id: s.cashierId,
      store_id: s.storeId,
      shift_id: s.shiftId,
      event,
      payload,
    });
  } catch (e) {
    // audit logging is best-effort
    console.debug('audit log failed', e);
  }
}

function getDeviceName(): string {
  try {
    const k = 'maxora_device_name';
    let v = localStorage.getItem(k);
    if (!v) {
      v = `Device-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return 'Device';
  }
}
