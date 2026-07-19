const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE' };
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { transactionId } = await req.json();
    if (!transactionId) return json({ error: 'transactionId required' }, 400);

    const { data: txn, error } = await admin.from('gateway_transactions').select('*').eq('id', transactionId).single();
    if (error || !txn) return json({ error: 'not_found' }, 404);

    return json({
      status: txn.status,
      gatewayTxnId: txn.gateway_txn_id,
      amount: txn.amount,
      fees: txn.fees,
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
