const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE' };
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { connectionId, request } = await req.json();
    if (!connectionId || !request?.amount || !request?.storeId) {
      return json({ error: 'connectionId, storeId, amount required' }, 400);
    }

    const { data: conn, error } = await admin.from('merchant_gateway_connections').select('*').eq('id', connectionId).single();
    if (error || !conn) return json({ error: 'connection_not_found' }, 404);
    if (!conn.enabled || conn.status !== 'connected') return json({ error: 'gateway_disabled' }, 400);

    // Build UPI dynamic QR payload for India gateways (generic fallback)
    const gatewayTxnId = `${conn.gateway_id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const vpa = conn.merchant_account_id || 'merchant@upi';
    const payee = encodeURIComponent(conn.display_name || 'Merchant');
    const amt = Number(request.amount).toFixed(2);
    const qrPayload = `upi://pay?pa=${vpa}&pn=${payee}&am=${amt}&cu=INR&tn=${gatewayTxnId}`;
    const expiresAt = new Date(Date.now() + (request.expiresInSec || 300) * 1000).toISOString();

    const { data: txn, error: txnErr } = await admin.from('gateway_transactions').insert({
      store_id: request.storeId,
      order_id: request.orderId || null,
      connection_id: conn.id,
      gateway_id: conn.gateway_id,
      gateway_txn_id: gatewayTxnId,
      amount: request.amount,
      currency: request.currency || 'INR',
      status: 'pending',
      qr_payload: qrPayload,
    }).select().single();
    if (txnErr) throw txnErr;

    return json({
      transactionId: txn.id,
      gatewayTxnId,
      qrPayload,
      expiresAt,
    });
  } catch (e: any) {
    console.error('[create-charge]', e);
    return json({ error: e.message || 'internal_error' }, 500);
  }
});
function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
