import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 200);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleRow) return json({ error: "Only admins can create merchants" }, 200);

    const body = await req.json();
    const {
      fullName, email, businessName, businessType,
      phone, password, plan, addons = [],
    } = body;

    if (!fullName || !email || !businessName || !phone || !password) {
      return json({ error: "Missing required fields" }, 200);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Pre-check: does a user with this email already exist?
    try {
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const dupe = existing?.users?.find(
        (u: any) => (u.email || "").toLowerCase() === normalizedEmail
      );
      if (dupe) {
        return json({
          error: `An account with the email "${normalizedEmail}" already exists. Please use a different email address.`,
        }, 200);
      }
    } catch (_) { /* fall through to createUser */ }

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (authErr || !authData.user) {
      const msg = authErr?.message || "Failed to create user";
      const friendly = /already been registered|already exists|duplicate/i.test(msg)
        ? `An account with the email "${normalizedEmail}" already exists. Please use a different email address.`
        : msg;
      return json({ error: friendly }, 200);
    }

    const newUserId = authData.user.id;

    const { data: merchant, error: mErr } = await admin.from("merchants").insert({
      owner_user_id: newUserId,
      business_name: businessName,
      owner_name: fullName,
      owner_email: normalizedEmail,
      phone,
      business_type: businessType || "retail",
      subscription_plan: plan,
      subscription_tier: plan,
      approval_status: "approved",
      is_active: true,
    }).select("id").single();

    if (mErr) {
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: mErr.message }, 200);
    }

    const { error: cErr } = await admin.from("customers").insert({
      id: merchant.id,
      name: businessName,
      owner_user_id: newUserId,
      business_name: businessName,
      owner_name: fullName,
      owner_email: normalizedEmail,
      business_type: businessType || "retail",
      subscription_plan: plan,
      subscription_tier: plan,
      enabled_addons: addons,
      is_active: true,
      approval_status: "approved"
    });

    if (cErr) {
      await admin.from("merchants").delete().eq("id", merchant.id);
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: cErr.message }, 200);
    }

    // Replace any default role row created by handle_new_user trigger
    await admin.from("user_roles").delete().eq("user_id", newUserId);
    const { error: rErr } = await admin.from("user_roles").insert({
      user_id: newUserId,
      role: "owner",
      merchant_id: merchant.id,
      customer_id: merchant.id,
      is_active: true,
    });
    if (rErr) {
      await admin.from("merchants").delete().eq("id", merchant.id);
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: rErr.message }, 200);
    }

    // Set up merchant_subscription
    let staffLimit = 2;
    let outletLimit = 1;
    if (plan === 'gold') {
      staffLimit = 10;
      outletLimit = 3;
    } else if (plan === 'platinum') {
      staffLimit = 999;
      outletLimit = 999;
    } else if (plan === 'custom') {
      staffLimit = 10;
      outletLimit = 3; // Give decent limits for custom plan
    }

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year expiry

    const { error: subErr } = await admin.from("merchant_subscription").insert({
      merchant_id: merchant.id,
      plan_name: plan,
      status: 'active',
      staff_limit: staffLimit,
      outlet_limit: outletLimit,
      extra_staff: 0,
      extra_outlets: 0,
      start_date: new Date().toISOString(),
      expiry_date: expiryDate.toISOString()
    });

    if (subErr) {
       console.error("merchant_subscription error", subErr);
    }

    // Log revenue for the new merchant
    const PLAN_PRICING: Record<string, number> = {
      basic: 7999,
      gold: 14999,
      platinum: 24999,
      custom: 0,
    };
    
    const ADDONS_PRICING: Record<string, number> = {
      'QR Ordering Menu': 1999, 'Staff Management': 1999, 'Delivery System': 2999, 'Barcode Scanner': 999,
      'Recipe Management': 3999, 'Team Chat': 999, 'Executive Sales Dashboard': 2999, 'Employee Summary': 1499,
      'Group Summary': 1499, 'Transaction Summary': 1499, 'Cover Size Summary': 1499, 'ZIP Summary': 1499,
      'Counter Summary': 1499, 'Expense Tracker': 1999, 'Cash Flow': 1999, 'Withdrawal Report': 999,
      'P&L Report': 2999, 'Sales Trend Report': 1999, 'Hourly Sales': 999, 'Customer Report': 1499,
      'Loss Control': 2999, 'Table/KOT System': 2999, 'Item Report': 1499, 'Retention Report': 1999,
      'Target Report': 1999, 'Kitchen Display System (KDS)': 3999, 'Invoices': 999, 'AI Insights': 4999,
      'Smart Inventory AI': 4999, 'Billing POS Additional Device': 1999, 'Multi Outlet Dashboard': 4999,
      'Basic Inventory': 1999, 'Customer Management': 1999, 'Sales Comments': 999, 'Order Summary': 999,
      'Category Summary': 999, 'Item Summary': 999, 'Payment Reports': 1499,
    };

    let amount_added = PLAN_PRICING[plan || 'basic'] || 0;
    if (plan === 'custom' && Array.isArray(addons)) {
      addons.forEach((a: string) => { amount_added += ADDONS_PRICING[a] || 0; });
    }
    
    await admin.from('revenue_audit').insert({
      merchant_id: merchant.id,
      merchant_name: businessName,
      plan_purchased: plan || 'basic',
      addons_purchased: addons,
      amount_added: amount_added,
      created_by: user.id
    });

    return json({ success: true, merchant_id: merchant.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 200);
  }
});
