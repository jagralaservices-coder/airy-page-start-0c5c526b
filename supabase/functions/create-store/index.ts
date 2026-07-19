import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader || authHeader === 'Bearer null') {
      return new Response(JSON.stringify({ error: 'Authorization header is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authUserError } = await supabaseAdmin.auth.getUser(token)
    if (authUserError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Allow owner, admin, super_admin to create stores
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role, merchant_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const allowed = (roles || []).find((r: any) =>
      ['owner', 'admin', 'super_admin'].includes(r.role)
    )
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient role to create stores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const {
      store_id,
      merchant_id: bodyMerchantId,
      store_name,
      email,
      password,
      phone,
      address,
      business_type,
      country,
      currency_code,
      tax_type,
      tax_percentage,
    } = body

    // Resolve merchant_id: prefer caller's own merchant, fallback to body (super_admin/admin)
    let merchant_id: string | null = allowed.merchant_id || bodyMerchantId || null
    if (!merchant_id) {
      return new Response(JSON.stringify({ error: 'No merchant account linked to this user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!store_name || !email || !password) {
      return new Response(JSON.stringify({ error: 'Store name, email, and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (store_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(store_id))) {
      return new Response(JSON.stringify({ error: 'Invalid store id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    // Resolve merchant from BOTH tables (legacy data lives in `customers`, new in `merchants`).
    // Whichever table holds the row, we use its plan + business_type to enforce outlet limits
    // and inherit them onto the new store via the matching FK (customer_id or merchant_id).
    const [{ data: merchantRow }, { data: customerRow }] = await Promise.all([
      supabaseAdmin
        .from('merchants')
        .select('id, max_stores, subscription_plan, business_type')
        .eq('id', merchant_id)
        .maybeSingle(),
      supabaseAdmin
        .from('customers')
        .select('id, max_stores, subscription_plan, business_type, enabled_addons')
        .eq('id', merchant_id)
        .maybeSingle(),
    ])

    const merchantSource = merchantRow || customerRow
    if (!merchantSource) {
      return new Response(JSON.stringify({ error: 'Invalid merchant account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const useCustomerFk = !merchantRow && !!customerRow
    const planName = String((merchantSource as any).subscription_plan || 'basic').toLowerCase()
    const merchantBizType = String((merchantSource as any).business_type || business_type || 'restaurant').toLowerCase()

    // Plan-based outlet limit (mirrors src/lib/subscriptionConfig.ts) + addon-based extras.
    const TIER_OUTLETS: Record<string, number> = { basic: 1, gold: 1, platinum: 2, custom: 1 }
    const planMaxOutlets = TIER_OUTLETS[planName] ?? 1
    const { data: subRow } = await supabaseAdmin
      .from('merchant_subscription')
      .select('extra_outlets')
      .eq('merchant_id', merchant_id)
      .maybeSingle()
    const extraOutlets = Number((subRow as any)?.extra_outlets || 0)
    const allowedOutlets = planMaxOutlets + extraOutlets

    // Count existing active stores for this merchant under either FK
    const orFilter = useCustomerFk
      ? `customer_id.eq.${merchant_id}`
      : `merchant_id.eq.${merchant_id},customer_id.eq.${merchant_id}`
    const { count } = await supabaseAdmin
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .or(orFilter)
      .eq('is_active', true)

    if (allowed.role !== 'admin' && allowed.role !== 'super_admin') {
      if ((count || 0) >= allowedOutlets) {
        return new Response(JSON.stringify({
          error: `Outlet limit reached (${allowedOutlets}). Upgrade plan or buy an outlet add-on.`,
          required_plan: planName === 'basic' ? 'platinum' : 'platinum',
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    } else {
      // Admin / super_admin still respect the merchant's plan so store inherits plan correctly.
      if ((count || 0) >= allowedOutlets) {
        return new Response(JSON.stringify({
          error: `${(merchantSource as any).business_name || 'Merchant'} is on the ${planName.toUpperCase()} plan and already has ${count} of ${allowedOutlets} allowed outlet(s). Upgrade the merchant's plan first.`,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Find or create auth user for the store login
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    )

    let userId: string
    if (existingUser) {
      userId = existingUser.id
      // Update password so the new credentials work
      await supabaseAdmin.auth.admin.updateUserById(userId, { password })
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: store_name.trim() }
      })
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      userId = authData.user.id
    }

    // Insert the store — link to whichever FK holds the merchant record so plan resolution works.
    const { data: dbStore, error: storeError } = await supabaseAdmin
      .from('stores')
      .insert({
        ...(store_id ? { id: store_id } : {}),
        ...(useCustomerFk ? { customer_id: merchant_id } : { merchant_id }),
        name: String(store_name).trim(),
        email: normalizedEmail,
        phone: phone || null,
        address: address || null,
        business_type: merchantBizType || business_type || 'restaurant',
        country: country || 'India',
        currency_code: currency_code || 'INR',
        tax_type: tax_type || 'GST',
        tax_percentage: tax_percentage ?? 0,
        is_active: true,
      })
      .select('id, name')
      .single()

    if (storeError) {
      if (!existingUser) await supabaseAdmin.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: 'Failed to create store: ' + storeError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Attach store_manager role linked to the SAME merchant FK so plan/feature lookups inherit correctly.
    const { error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'store_manager',
        ...(useCustomerFk ? { customer_id: merchant_id } : { merchant_id }),
        store_id: dbStore.id,
        is_active: true,
      })
    if (roleErr) {
      // Best-effort cleanup
      await supabaseAdmin.from('stores').delete().eq('id', dbStore.id)
      if (!existingUser) await supabaseAdmin.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: roleErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({
        success: true,
        store: {
          id: dbStore.id,
          store_code: dbStore.id.slice(0, 8).toUpperCase(),
          store_name: dbStore.name,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('create-store error:', err)
    return new Response(JSON.stringify({ error: err?.message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
