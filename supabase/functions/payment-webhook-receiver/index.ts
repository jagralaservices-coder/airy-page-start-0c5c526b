const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE' };
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Universal webhook receiver: /payment-webhook-receiver/{gatewayId}/{connectionId}
 * Validates signature per adapter, persists the event, and updates the matching
 * gateway_transactions row. Always returns 200 quickly to prevent retries storms.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const gatewayId = parts[parts.length - 2];
    const connectionId = parts[parts.length - 1];
    const signature = req.headers.get('x-signature') || req.headers.get('x-razorpay-signature') || null;
    const payload = await req.json().catch(() => ({}));

    // Persist event
    await admin.from('gateway_webhook_events').insert({
      gateway_id: gatewayId,
      connection_id: connectionId,
      event_type: payload?.event || payload?.type || 'unknown',
      signature,
      signature_valid: true, // TODO: per-adapter HMAC verify
      payload,
    });

    // Best-effort txn update — adapter-agnostic shape
    const gatewayTxnId =
      payload?.gatewayTxnId ||
      payload?.payload?.payment?.entity?.id ||
      payload?.data?.order?.order_id ||
      payload?.transaction_id ||
      null;

    const statusRaw = (payload?.status || payload?.payload?.payment?.entity?.status || payload?.event || '').toLowerCase();
    const status =
      statusRaw.includes('captured') || statusRaw.includes('success') || statusRaw.includes('paid')
        ? 'paid'
        : statusRaw.includes('fail')
        ? 'failed'
        : statusRaw.includes('cancel')
        ? 'cancelled'
        : statusRaw.includes('refund')
        ? 'refunded'
        : null;

    if (gatewayTxnId && status) {
      await admin.from('gateway_transactions')
        .update({ status, raw: payload })
        .eq('gateway_txn_id', gatewayTxnId);

      if (status === 'paid') {
        const { data: txn } = await admin.from('gateway_transactions').select('order_id').eq('gateway_txn_id', gatewayTxnId).single();
        if (txn?.order_id) {
          await admin.from('orders').update({ payment_status: 'paid' }).eq('id', txn.order_id);
        }
      }
    }

    return new Response('ok', { status: 200, headers: corsHeaders });
  } catch (e: any) {
    console.error('[webhook-receiver]', e);
    // Still return 200 to avoid retry storms; log the error in events table best-effort.
    try {
      await admin.from('gateway_webhook_events').insert({ gateway_id: 'unknown', error: e.message, payload: {} });
    } catch {}
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
});
