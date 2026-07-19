/**
 * MAXORA Accounting — Posting Engine (client-side facade)
 * Sends balanced double-entry journals to the accounting-post-journal edge function.
 * Idempotent by (merchant_id, idempotency_key).
 */
import { supabase } from '@/integrations/supabase/client';

export interface JournalLineInput {
  account_code?: string;   // preferred: use COA code
  account_id?: string;     // or direct id
  debit?: number;
  credit?: number;
  description?: string;
  party_type?: 'customer' | 'supplier' | 'staff' | 'other';
  party_id?: string;
  cost_center_id?: string;
  tax_code?: string;
  metadata?: Record<string, unknown>;
}

export interface PostJournalArgs {
  merchantId?: string;
  storeId?: string | null;
  entryDate?: string; // yyyy-mm-dd
  sourceType: string; // e.g. 'sale' | 'refund' | 'purchase' | 'expense' | 'manual' | 'credit_payment'
  sourceId?: string | null;
  idempotencyKey: string;
  narration?: string;
  status?: 'draft' | 'pending_approval' | 'posted';
  lines: JournalLineInput[];
}

export interface PostJournalResult {
  ok: boolean;
  id?: string;
  entry_no?: string;
  deduped?: boolean;
  error?: string;
}

export async function postJournal(args: PostJournalArgs): Promise<PostJournalResult> {
  const totalD = args.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = args.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.round(totalD * 100) !== Math.round(totalC * 100)) {
    return { ok: false, error: `unbalanced: debit ${totalD} != credit ${totalC}` };
  }

  try {
    const { data, error } = await supabase.functions.invoke('accounting-post-journal', {
      body: {
        merchant_id: args.merchantId,
        store_id: args.storeId ?? null,
        entry_date: args.entryDate,
        source_type: args.sourceType,
        source_id: args.sourceId ?? null,
        idempotency_key: args.idempotencyKey,
        narration: args.narration,
        status: args.status || 'posted',
        lines: args.lines,
      },
    });
    if (error) return { ok: false, error: error.message };
    return data as PostJournalResult;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'post failed' };
  }
}

/** Build standard sale journal from an order total breakdown. */
export function buildSaleJournal(params: {
  orderId: string;
  storeId: string;
  paymentMode: 'cash' | 'card' | 'upi' | 'credit' | 'wallet' | 'bank';
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount: number;
  roundOff: number;
  total: number;
  customerId?: string;
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [];
  // Debit side (money in)
  const debitAccount =
    params.paymentMode === 'cash' ? '1000' :
    params.paymentMode === 'credit' ? '1200' :
    params.paymentMode === 'card' || params.paymentMode === 'upi' || params.paymentMode === 'wallet' ? '1500' :
    '1100';
  lines.push({
    account_code: debitAccount,
    debit: Number(params.total.toFixed(2)),
    description: `Sale ${params.orderId}`,
    party_type: params.paymentMode === 'credit' ? 'customer' : undefined,
    party_id: params.paymentMode === 'credit' ? params.customerId : undefined,
  });
  // Credit side (income + tax + round-off)
  if (params.discount > 0) {
    lines.push({ account_code: '4020', debit: Number(params.discount.toFixed(2)), description: 'Discount given' });
  }
  const netSale = params.subtotal - params.discount;
  if (netSale > 0) lines.push({ account_code: '4000', credit: Number(netSale.toFixed(2)), description: 'Sales' });
  if (params.cgst > 0) lines.push({ account_code: '2100', credit: Number(params.cgst.toFixed(2)), description: 'Output CGST' });
  if (params.sgst > 0) lines.push({ account_code: '2110', credit: Number(params.sgst.toFixed(2)), description: 'Output SGST' });
  if (params.igst > 0) lines.push({ account_code: '2120', credit: Number(params.igst.toFixed(2)), description: 'Output IGST' });
  if (params.roundOff !== 0) {
    if (params.roundOff > 0) lines.push({ account_code: '4200', credit: Number(params.roundOff.toFixed(2)), description: 'Round-off' });
    else lines.push({ account_code: '4200', debit: Number(Math.abs(params.roundOff).toFixed(2)), description: 'Round-off' });
  }
  return lines;
}

export async function ensureCoaSeeded(merchantId: string) {
  const { count } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('merchant_id', merchantId);
  if ((count ?? 0) > 0) return;
  await supabase.rpc('seed_default_coa' as any, { _merchant_id: merchantId });
}

/** Build a refund/return journal — reverses the sale. */
export function buildRefundJournal(params: {
  orderId: string;
  paymentMode: 'cash' | 'card' | 'upi' | 'credit' | 'wallet' | 'bank';
  subtotal: number; cgst: number; sgst: number; igst: number; total: number;
  customerId?: string;
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [];
  const creditAcct = params.paymentMode === 'cash' ? '1000'
    : params.paymentMode === 'credit' ? '1200'
    : ['card', 'upi', 'wallet'].includes(params.paymentMode) ? '1500' : '1100';
  lines.push({ account_code: creditAcct, credit: Number(params.total.toFixed(2)), description: `Refund ${params.orderId}`,
    party_type: params.paymentMode === 'credit' ? 'customer' : undefined, party_id: params.customerId });
  if (params.subtotal > 0) lines.push({ account_code: '4010', debit: Number(params.subtotal.toFixed(2)), description: 'Sales return' });
  if (params.cgst > 0) lines.push({ account_code: '2100', debit: Number(params.cgst.toFixed(2)), description: 'Output CGST reversal' });
  if (params.sgst > 0) lines.push({ account_code: '2110', debit: Number(params.sgst.toFixed(2)), description: 'Output SGST reversal' });
  if (params.igst > 0) lines.push({ account_code: '2120', debit: Number(params.igst.toFixed(2)), description: 'Output IGST reversal' });
  return lines;
}

/** Build a purchase journal — inventory + input GST vs AP/cash/bank. */
export function buildPurchaseJournal(params: {
  purchaseId: string; paymentMode: 'cash' | 'credit' | 'bank';
  subtotal: number; cgst: number; sgst: number; igst: number; total: number;
  supplierId?: string;
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [];
  if (params.subtotal > 0) lines.push({ account_code: '1300', debit: Number(params.subtotal.toFixed(2)), description: `Purchase ${params.purchaseId}` });
  if (params.cgst > 0) lines.push({ account_code: '1400', debit: Number(params.cgst.toFixed(2)), description: 'Input CGST' });
  if (params.sgst > 0) lines.push({ account_code: '1410', debit: Number(params.sgst.toFixed(2)), description: 'Input SGST' });
  if (params.igst > 0) lines.push({ account_code: '1420', debit: Number(params.igst.toFixed(2)), description: 'Input IGST' });
  const credAcct = params.paymentMode === 'cash' ? '1000' : params.paymentMode === 'bank' ? '1100' : '2000';
  lines.push({ account_code: credAcct, credit: Number(params.total.toFixed(2)), description: 'Purchase settlement',
    party_type: params.paymentMode === 'credit' ? 'supplier' : undefined, party_id: params.supplierId });
  return lines;
}

/** Build an expense journal. */
export function buildExpenseJournal(params: {
  expenseId: string; categoryCode?: string; amount: number;
  paymentMode: 'cash' | 'bank' | 'credit'; supplierId?: string; description?: string;
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [];
  lines.push({ account_code: params.categoryCode || '5100', debit: Number(params.amount.toFixed(2)), description: params.description || `Expense ${params.expenseId}` });
  const credAcct = params.paymentMode === 'cash' ? '1000' : params.paymentMode === 'bank' ? '1100' : '2000';
  lines.push({ account_code: credAcct, credit: Number(params.amount.toFixed(2)), description: 'Expense settlement',
    party_type: params.paymentMode === 'credit' ? 'supplier' : undefined, party_id: params.supplierId });
  return lines;
}

/** Build a credit payment (customer paying an outstanding invoice) journal. */
export function buildCreditPaymentJournal(params: {
  paymentId: string; customerId: string; amount: number; mode: 'cash' | 'card' | 'upi' | 'bank';
}): JournalLineInput[] {
  const debitAcct = params.mode === 'cash' ? '1000' : params.mode === 'bank' ? '1100' : '1500';
  return [
    { account_code: debitAcct, debit: Number(params.amount.toFixed(2)), description: `Credit payment ${params.paymentId}` },
    { account_code: '1200', credit: Number(params.amount.toFixed(2)), description: 'Credit collection',
      party_type: 'customer', party_id: params.customerId },
  ];
}

/** Convenience: post a sale in one call. */
export async function postSaleAuto(args: {
  merchantId: string; storeId: string; orderId: string;
  paymentMode: 'cash' | 'card' | 'upi' | 'credit' | 'wallet' | 'bank';
  subtotal: number; cgst: number; sgst: number; igst: number; discount: number; roundOff: number; total: number;
  customerId?: string; entryDate?: string;
}): Promise<PostJournalResult> {
  await ensureCoaSeeded(args.merchantId).catch(() => {});
  const lines = buildSaleJournal({
    orderId: args.orderId, storeId: args.storeId, paymentMode: args.paymentMode,
    subtotal: args.subtotal, cgst: args.cgst, sgst: args.sgst, igst: args.igst,
    discount: args.discount, roundOff: args.roundOff, total: args.total, customerId: args.customerId,
  });
  return postJournal({
    merchantId: args.merchantId, storeId: args.storeId, sourceType: 'sale', sourceId: args.orderId,
    idempotencyKey: `sale:${args.orderId}`, entryDate: args.entryDate,
    narration: `Auto sale journal for order ${args.orderId}`, status: 'posted', lines,
  });
}

