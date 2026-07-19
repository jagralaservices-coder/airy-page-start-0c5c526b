// Dedicated endpoint: verify a user's password WITHOUT replacing the caller's
// session. The previous code called `supabase.auth.signInWithPassword` directly
// from the browser just to confirm a password — that mutates the auth state,
// fires a SIGNED_IN event, and rotates the JWT. This endpoint isolates that
// concern: it spins up an ephemeral Supabase client server-side, attempts the
// sign-in there, and returns only { valid: boolean }. Nothing about the
// caller's existing session is touched.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { password, email } = await req.json().catch(() => ({}));
    if (!password || typeof password !== "string") {
      return new Response(JSON.stringify({ error: "password_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prefer the authenticated caller's email when a fresh JWT is available.
    // If the desktop/PWA restored an offline-first cached session and the JWT is
    // stale, fall back to the caller-provided login email and verify it with the
    // password below. This keeps verification isolated without rotating the
    // browser session or forcing logout.
    let callerEmail: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && authHeader !== "Bearer null" && !authHeader.endsWith("undefined")) {
      const sessionClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await sessionClient.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (!userErr && userData?.user?.email) {
        callerEmail = userData.user.email.toLowerCase();
      }
    }

    const fallbackEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!callerEmail && fallbackEmail) callerEmail = fallbackEmail;

    if (!callerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(callerEmail)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ephemeral client — its sign-in does NOT touch the browser session.
    const ephemeral = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await ephemeral.auth.signInWithPassword({
      email: callerEmail,
      password,
    });
    // Always sign the ephemeral client out so no token lingers in memory.
    try { await ephemeral.auth.signOut(); } catch (_) { /* noop */ }

    return new Response(JSON.stringify({ valid: !error }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
