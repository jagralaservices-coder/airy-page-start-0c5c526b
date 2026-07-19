const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE' };
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { transactionId, gatewayTxnId, amount, reason } = await req.json();
    if (!transactionId || !amount) return json({ error: 'transactionId and amount required' }, 400);

    const { data: txn, error } = await admin.from('gateway_transactions').select('*').eq('id', transactionId).single();
    if (error || !txn) return json({ error: 'txn_not_found' }, 404);

    const refundId = `${txn.gateway_id}_ref_${Date.now()}`;
    const { data: refund, error: rErr } = await admin.from('gateway_refunds').insert({
      store_id: txn.store_id,
      transaction_id: txn.id,
      gateway_id: txn.gateway_id,
      gateway_refund_id: refundId,
      amount,
      reason,
      status: 'processed',
      refund_date: new Date().toISOString(),
    }).select().single();
    if (rErr) throw rErr;

    const newStatus = Number(amount) >= Number(txn.amount) ? 'refunded' : 'partially_refunded';
    await admin.from('gateway_transactions').update({ status: newStatus }).eq('id', txn.id);

    return json({ gatewayRefundId: refundId, status: 'processed', refund });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
