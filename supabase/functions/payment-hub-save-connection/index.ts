const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE' };
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: authErr } = await supa.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (authErr || !claims) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { connection, secretKey } = await req.json();
    if (!connection?.store_id || !connection?.gateway_id) {
      return json({ error: 'store_id and gateway_id required' }, 400);
    }

    // Build webhook url
    const projectUrl = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = `${projectUrl}/functions/v1/payment-webhook-receiver/${connection.gateway_id}/${connection.id || 'new'}`;

    const row: any = {
      ...connection,
      webhook_url: webhookUrl,
      status: connection.status || 'connected',
      created_by: claims.claims.sub,
    };
    if (secretKey) row.secret_key_encrypted = secretKey; // TODO: encrypt at rest via pgcrypto

    let saved;
    if (connection.id) {
      const { data, error } = await admin.from('merchant_gateway_connections')
        .update(row).eq('id', connection.id).select().single();
      if (error) throw error;
      saved = data;
    } else {
      delete row.id;
      const { data, error } = await admin.from('merchant_gateway_connections')
        .insert(row).select().single();
      if (error) throw error;
      saved = data;
      // patch webhook_url with real id
      const realUrl = `${projectUrl}/functions/v1/payment-webhook-receiver/${saved.gateway_id}/${saved.id}`;
      await admin.from('merchant_gateway_connections').update({ webhook_url: realUrl }).eq('id', saved.id);
      saved.webhook_url = realUrl;
    }

    return json({ ok: true, connection: { ...saved, secret_key_encrypted: undefined } });
  } catch (e: any) {
    console.error('[save-connection]', e);
    return json({ error: e.message || 'internal_error' }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
