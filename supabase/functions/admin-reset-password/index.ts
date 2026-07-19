import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reset-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const provided = req.headers.get("x-reset-token") || "";
    const expected = Deno.env.get("RESET_ADMIN_TOKEN") || "";
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { email, password } = await req.json();
    if (!email || !password) return new Response(JSON.stringify({ error: "email and password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (lErr) return new Response(JSON.stringify({ error: lErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const target = list.users.find(u => u.email?.toLowerCase() === String(email).toLowerCase());
    if (!target) return new Response(JSON.stringify({ error: "user not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { error: upErr } = await admin.auth.admin.updateUserById(target.id, { password, email_confirm: true });
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ success: true, email: target.email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "err" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
