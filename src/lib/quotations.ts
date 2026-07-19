import { supabase } from '@/integrations/supabase/client';

export type QuotationStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'expired' | 'converted';

export interface QuotationItem {
  id?: string;
  quotation_id?: string;
  store_id?: string;
  product_id?: string | null;
  product_name: string;
  sku?: string | null;
  quantity: number;
  price: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes?: string | null;
}

export interface Quotation {
  id?: string;
  store_id: string;
  quotation_no: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  salesperson_id?: string | null;
  salesperson_name?: string | null;
  status: QuotationStatus;
  subtotal: number;
  discount: number;
  tax: number;
  grand_total: number;
  notes?: string | null;
  terms?: string | null;
  expiry_date?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  converted_at?: string | null;
  converted_order_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: QuotationItem[];
}

export const generateQuotationNo = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `QT-${ymd}-${rnd}`;
};

export const computeItemTotal = (i: Partial<QuotationItem>): QuotationItem => {
  const qty = Number(i.quantity || 0);
  const price = Number(i.price || 0);
  const discount = Number(i.discount || 0);
  const taxRate = Number(i.tax_rate || 0);
  const gross = qty * price - discount;
  const tax = +(gross * (taxRate / 100)).toFixed(2);
  const total = +(gross + tax).toFixed(2);
  return {
    product_name: i.product_name || '',
    product_id: i.product_id ?? null,
    sku: i.sku ?? null,
    quantity: qty,
    price,
    discount,
    tax_rate: taxRate,
    tax_amount: tax,
    total,
    notes: i.notes ?? null,
  };
};

export const computeTotals = (items: QuotationItem[]) => {
  const subtotal = +items.reduce((s, i) => s + i.quantity * i.price, 0).toFixed(2);
  const discount = +items.reduce((s, i) => s + i.discount, 0).toFixed(2);
  const tax = +items.reduce((s, i) => s + i.tax_amount, 0).toFixed(2);
  const grand_total = +items.reduce((s, i) => s + i.total, 0).toFixed(2);
  return { subtotal, discount, tax, grand_total };
};

export const listQuotations = async (storeIds: string[] | 'all') => {
  let q = supabase.from('quotations' as any).select('*').order('created_at', { ascending: false });
  if (storeIds !== 'all') q = q.in('store_id', storeIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any as Quotation[]) || [];
};

export const getQuotation = async (id: string) => {
  const { data, error } = await supabase.from('quotations' as any).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const { data: items, error: ie } = await supabase
    .from('quotation_items' as any)
    .select('*')
    .eq('quotation_id', id);
  if (ie) throw ie;
  return { ...(data as any), items: (items as any) || [] } as Quotation;
};

export const saveQuotation = async (q: Quotation, items: QuotationItem[]) => {
  const totals = computeTotals(items);
  const payload: any = { ...q, ...totals };
  delete payload.items;
  let id = q.id;
  if (id) {
    const { error } = await supabase.from('quotations' as any).update(payload).eq('id', id);
    if (error) throw error;
    await supabase.from('quotation_items' as any).delete().eq('quotation_id', id);
  } else {
    const { data, error } = await supabase.from('quotations' as any).insert(payload).select('id').single();
    if (error) throw error;
    id = (data as any).id;
  }
  if (items.length) {
    const rows = items.map(i => ({ ...i, quotation_id: id, store_id: q.store_id }));
    const { error } = await supabase.from('quotation_items' as any).insert(rows);
    if (error) throw error;
  }
  return id!;
};

export const deleteQuotation = async (id: string) => {
  const { error } = await supabase.from('quotations' as any).delete().eq('id', id);
  if (error) throw error;
};

export const setQuotationStatus = async (
  id: string,
  status: QuotationStatus,
  extra: Partial<Quotation> = {},
) => {
  const patch: any = { status, ...extra };
  if (status === 'approved') { patch.approved_at = new Date().toISOString(); patch.approved_by = (await supabase.auth.getUser()).data.user?.id; }
  if (status === 'rejected') { patch.rejected_at = new Date().toISOString(); patch.rejected_by = (await supabase.auth.getUser()).data.user?.id; }
  if (status === 'converted') { patch.converted_at = new Date().toISOString(); }
  const { error } = await supabase.from('quotations' as any).update(patch).eq('id', id);
  if (error) throw error;
};

export const expireOldQuotations = async () => {
  try { await (supabase as any).rpc('expire_old_quotations'); } catch {}
};

export const STATUS_COLORS: Record<QuotationStatus, string> = {
  draft: 'bg-slate-500',
  pending: 'bg-amber-500',
  approved: 'bg-emerald-600',
  rejected: 'bg-rose-600',
  expired: 'bg-zinc-500',
  converted: 'bg-primary',
};
