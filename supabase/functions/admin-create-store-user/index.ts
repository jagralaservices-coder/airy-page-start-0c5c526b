// Creates an auth user (email+password) and assigns them as store_manager/owner
// for a given merchant. Returns the new user_id so the caller can stamp
// stores.owner_id. Admin/super_admin only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: { user }, error: uErr } = await client.auth.getUser(token);
    if (uErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: role } = await admin.from("user_roles").select("role")
      .eq("user_id", user.id).in("role", ["admin", "super_admin"]).eq("is_active", true).maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Only admins can create store logins" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, password, full_name, merchant_id, store_id, role: roleName } = body || {};
    if (!email || !password || !merchant_id) {
      return new Response(JSON.stringify({ error: "email, password and merchant_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const assignedRole = roleName === "owner" ? "owner" : "store_manager";

    // 1. Create auth user (auto-confirmed so they can log in immediately)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || normalizedEmail.split("@")[0] },
    });
    if (cErr || !created?.user) {
      return new Response(JSON.stringify({ error: cErr?.message || "Failed to create user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = created.user.id;

    // 2. Insert active role scoped to merchant (+ store if provided)
    const { error: rErr } = await admin.from("user_roles").insert({
      user_id: newUserId,
      role: assignedRole,
      merchant_id,
      store_id: store_id || null,
      is_active: true,
    });
    if (rErr) {
      await admin.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: rErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUserId, email: normalizedEmail }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
