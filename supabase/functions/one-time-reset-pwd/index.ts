import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = "jagralasalman786@gmail.com";
  const password = "salman2538";
  const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (lErr) return new Response(JSON.stringify({ error: lErr.message }), { status: 500 });
  const target = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!target) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });
  const { error: upErr } = await admin.auth.admin.updateUserById(target.id, { password, email_confirm: true });
  if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500 });
  return new Response(JSON.stringify({ success: true, id: target.id, email: target.email }), { headers: { "Content-Type": "application/json" } });
});
