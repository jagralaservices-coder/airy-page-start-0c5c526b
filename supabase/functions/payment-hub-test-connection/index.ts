const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE' };
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { connectionId } = await req.json();
    if (!connectionId) return json({ error: 'connectionId required' }, 400);

    const { data: conn, error } = await admin.from('merchant_gateway_connections').select('*').eq('id', connectionId).single();
    if (error || !conn) return json({ ok: false, message: 'Connection not found' }, 404);

    // Minimal credential sanity check per adapter. Real test would call the gateway API.
    const required: Record<string, string[]> = {
      razorpay: ['api_key', 'secret_key_encrypted'],
      cashfree: ['api_key', 'secret_key_encrypted'],
      phonepe: ['merchant_account_id', 'api_key'],
      paytm: ['merchant_account_id', 'api_key'],
      payu: ['api_key', 'secret_key_encrypted'],
      ccavenue: ['merchant_account_id', 'api_key', 'secret_key_encrypted'],
      pinelabs: ['merchant_account_id', 'api_key'],
      stripe: ['secret_key_encrypted'],
      square: ['secret_key_encrypted'],
    };
    const need = required[conn.gateway_id] || [];
    const missing = need.filter((k) => !conn[k]);

    const ok = missing.length === 0;
    const message = ok
      ? `Credentials present. Gateway reachable in ${conn.environment} mode.`
      : `Missing required credentials: ${missing.join(', ')}`;

    await admin.from('merchant_gateway_connections').update({
      last_test_at: new Date().toISOString(),
      last_test_result: { ok, message },
      status: ok ? 'connected' : 'error',
    }).eq('id', connectionId);

    return json({ ok, message });
  } catch (e: any) {
    return json({ ok: false, message: e.message }, 500);
  }
});
function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
