import { supabase } from '@/integrations/supabase/client';
import { currentStoreScope } from '@/lib/store';

export type ReturnReason =
  | 'damaged' | 'expired' | 'wrong_item' | 'customer_changed_mind'
  | 'billing_mistake' | 'quality_issue' | 'duplicate_billing' | 'other';

export type ReturnType = 'refund' | 'exchange' | 'credit_note';
export type RefundMethod =
  | 'cash' | 'upi' | 'card' | 'wallet' | 'original' | 'store_credit';

export const REASON_OPTIONS: { value: ReturnReason; label: string }[] = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'customer_changed_mind', label: 'Customer Changed Mind' },
  { value: 'billing_mistake', label: 'Billing Mistake' },
  { value: 'quality_issue', label: 'Quality Issue' },
  { value: 'duplicate_billing', label: 'Duplicate Billing' },
  { value: 'other', label: 'Other' },
];

export const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'original', label: 'Original Payment Method' },
  { value: 'store_credit', label: 'Store Credit' },
];

export interface OrderLine {
  product_id: string | null;
  name: string;
  category?: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface SearchedOrder {
  id: string;
  order_number: string | null;
  bill_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  total: number;
  created_at: string;
  items: OrderLine[];
  store_id: string;
}

export async function searchOrders(query: string, storeId: string): Promise<SearchedOrder[]> {
  const q = (query || '').trim();
  let req = supabase.from('orders').select('id, order_number, bill_number, customer_id, customer_name, customer_phone, payment_method, total, created_at, items, store_id')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (q) {
    req = req.or(`order_number.ilike.%${q}%,bill_number.ilike.%${q}%,customer_phone.ilike.%${q}%,customer_name.ilike.%${q}%`);
  }
  const { data, error } = await req;
  if (error) throw error;
  return (data || []).map((o: any) => ({
    ...o,
    total: Number(o.total) || 0,
    items: normalizeItems(o.items),
  }));
}

function normalizeItems(raw: any): OrderLine[] {
  if (!raw) return [];
  let items: any[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string') { try { items = JSON.parse(raw); } catch { items = []; } }
  else if (typeof raw === 'object') items = Array.isArray(raw.items) ? raw.items : [];
  return items.map((it: any) => ({
    product_id: it.product_id || it.productId || it.id || null,
    name: it.name || it.name_snapshot || it.product_name || 'Item',
    category: it.category || null,
    unit_price: Number(it.unit_price ?? it.price ?? 0),
    quantity: Number(it.quantity ?? it.qty ?? 1),
    line_total: Number(it.line_total ?? (Number(it.unit_price ?? it.price ?? 0) * Number(it.quantity ?? 1))),
  }));
}

export interface ReturnLineInput {
  product_id: string | null;
  name: string;
  category?: string | null;
  unit_price: number;
  quantity: number;          // return qty
  restock: boolean;
  damaged: boolean;
}

export interface ProcessReturnInput {
  storeId: string;
  merchantId?: string | null;
  originalOrder: SearchedOrder;
  lines: ReturnLineInput[];
  reason: ReturnReason;
  reasonNotes?: string;
  returnType: ReturnType;
  refundMethod?: RefundMethod;
  exchangeAmount?: number;          // gross value of exchange items
  exchangeDiff?: number;            // + customer pays extra, - we refund
  creditNoteExpiry?: string | null; // ISO date
  cashierName?: string | null;
  approvedBy?: string | null;
}

export interface ProcessReturnResult {
  returnId: string;
  returnNo: string;
  creditNoteId?: string;
  refundTotal: number;
}

const genNo = (prefix: string) =>
  `${prefix}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000+1000)}`;

export async function processReturn(input: ProcessReturnInput): Promise<ProcessReturnResult> {
  const store_id = input.storeId || currentStoreScope();
  if (!store_id) throw new Error('Active store missing — cannot save return');
  if (!input.lines.length) throw new Error('Select at least one item to return');

  const returnAmount = input.lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  let refundAmount = 0, creditAmount = 0, exchangeAmount = 0;
  if (input.returnType === 'refund') refundAmount = returnAmount;
  if (input.returnType === 'credit_note') creditAmount = returnAmount;
  if (input.returnType === 'exchange') exchangeAmount = input.exchangeAmount || returnAmount;

  const returnId = crypto.randomUUID();
  const returnNo = genNo('RET');

  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id || null;

  // 1. Insert sales_return
  const { error: rErr } = await supabase.from('sales_returns').insert({
    id: returnId,
    store_id,
    merchant_id: input.merchantId || null,
    return_no: returnNo,
    original_order_id: input.originalOrder.id,
    original_invoice_no: input.originalOrder.order_number || input.originalOrder.bill_number || null,
    customer_id: input.originalOrder.customer_id,
    customer_name: input.originalOrder.customer_name,
    customer_phone: input.originalOrder.customer_phone,
    return_amount: returnAmount,
    refund_amount: refundAmount,
    exchange_amount: exchangeAmount,
    credit_note_amount: creditAmount,
    exchange_diff: input.exchangeDiff || 0,
    refund_method: input.refundMethod || (input.returnType === 'credit_note' ? 'credit_note' : input.returnType === 'exchange' ? 'exchange' : null),
    reason: input.reason,
    reason_notes: input.reasonNotes || null,
    return_type: input.returnType,
    cashier_name: input.cashierName || null,
    returned_by: uid,
    approved_by: input.approvedBy ? uid : null,
    approved_at: input.approvedBy ? new Date().toISOString() : null,
    status: 'completed',
    metadata: { source: 'sales_return_center', v: 1 },
  });
  if (rErr) throw rErr;

  // 2. Insert items
  const itemRows = input.lines.map(l => ({
    return_id: returnId,
    store_id,
    product_id: l.product_id,
    product_name: l.name,
    category: l.category || null,
    quantity: l.quantity,
    unit_price: l.unit_price,
    line_total: l.unit_price * l.quantity,
    restock: l.restock && !l.damaged,
    damaged: l.damaged,
    refund_amount: input.returnType === 'refund' ? l.unit_price * l.quantity : 0,
  }));
  const { error: iErr } = await supabase.from('sales_return_items').insert(itemRows);
  if (iErr) throw iErr;

  // 3. Stock adjustments + restock for real products
  for (const l of input.lines) {
    if (!l.product_id) continue;
    const restock = l.restock && !l.damaged;
    await supabase.from('stock_adjustments').insert({
      product_id: l.product_id,
      store_id,
      adjustment_type: restock ? 'return_restock' : 'damaged',
      quantity: l.quantity,
      reason: `${restock ? 'Return restock' : 'Damaged return'} • ${returnNo}`,
      adjusted_by: uid,
    });
    if (restock) {
      const { data: prod } = await supabase.from('products')
        .select('stock').eq('id', l.product_id).maybeSingle();
      const cur = Number((prod as any)?.stock ?? 0);
      await supabase.from('products').update({ stock: cur + l.quantity }).eq('id', l.product_id);
    }
  }

  // 4. Credit note
  let creditNoteId: string | undefined;
  if (input.returnType === 'credit_note' && creditAmount > 0) {
    creditNoteId = crypto.randomUUID();
    const { error: cnErr } = await supabase.from('credit_notes').insert({
      id: creditNoteId,
      store_id,
      merchant_id: input.merchantId || null,
      note_no: genNo('CN'),
      customer_id: input.originalOrder.customer_id,
      customer_name: input.originalOrder.customer_name,
      customer_phone: input.originalOrder.customer_phone,
      original_return_id: returnId,
      original_invoice_no: input.originalOrder.order_number,
      issued_amount: creditAmount,
      redeemed_amount: 0,
      balance_amount: creditAmount,
      expiry_date: input.creditNoteExpiry || null,
      status: 'active',
      issued_by: uid,
      issued_by_name: input.cashierName || null,
    });
    if (cnErr) throw cnErr;
    await supabase.from('sales_returns').update({ credit_note_id: creditNoteId }).eq('id', returnId);
  }

  return { returnId, returnNo, creditNoteId, refundTotal: refundAmount };
}

export async function fetchReturns(storeId: string, limit = 100) {
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*')
    .eq('store_id', storeId)
    .order('returned_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchCreditNotes(storeId: string) {
  const { data, error } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}
