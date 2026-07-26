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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const { email, password, staff_code, store_id } = body

    // Support email+password login (new flow)
    if (email && password) {
      const normalizedEmail = email.trim().toLowerCase()

      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                       req.headers.get('cf-connecting-ip') || 'unknown'

      // Rate limit check
      const { data: rateLimitOk } = await supabaseAdmin.rpc('check_rate_limit', { 
        p_identifier: normalizedEmail, p_type: 'staff', p_max_attempts: 5, p_window_minutes: 15
      })

      if (rateLimitOk === false) {
        return new Response(
          JSON.stringify({ error: 'Too many login attempts. Please try again in 15 minutes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Look up user by email
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
      const foundUser = users?.find(u => u.email?.toLowerCase() === normalizedEmail)

      if (!foundUser) {
        await supabaseAdmin.rpc('log_login_attempt', {
          p_identifier: normalizedEmail, p_type: 'staff', p_success: false, p_ip: clientIp
        })
        return new Response(
          JSON.stringify({ error: 'Invalid email or password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify the supplied password/PIN. Older staff records store the operator
      // PIN in user_roles.pin while Auth password may have been created with a
      // compatibility suffix; accept all known formats so existing staff can log in.
      const passwordValue = String(password).trim()
      const passwordAttempts = Array.from(new Set([
        passwordValue,
        /^\d+$/.test(passwordValue) ? `${passwordValue}Aa@1` : '',
        /^\d+$/.test(passwordValue) ? `${passwordValue}#MaxoraPOS!26@Auth` : '',
      ].filter(Boolean)))

      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
      })

      let authPasswordValid = false
      for (const candidate of passwordAttempts) {
        const { error: signInError } = await authClient.auth.signInWithPassword({
          email: normalizedEmail,
          password: candidate,
        })
        if (!signInError) {
          authPasswordValid = true
          try { await authClient.auth.signOut() } catch (_) { /* noop */ }
          break
        }
      }

      // Verify the user has an active staff/store_manager role. Use an array and
      // choose deterministically because legacy duplicate rows can make maybeSingle fail.
      const { data: roleRows, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('id, user_id, role, store_id, customer_id, merchant_id, staff_code, ref_code, pin, is_active, created_at')
        .eq('user_id', foundUser.id)
        .eq('is_active', true)
        .in('role', ['staff', 'store_manager', 'cashier'])

      if (roleError || !roleRows || roleRows.length === 0) {
        await supabaseAdmin.rpc('log_login_attempt', {
          p_identifier: normalizedEmail, p_type: 'staff', p_success: false, p_ip: clientIp
        })
        return new Response(
          JSON.stringify({ error: 'No active staff account found for this email' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const rolePriority: Record<string, number> = { store_manager: 1, staff: 2, cashier: 3 }
      const sortedRoles = (roleRows || []).slice().sort((a: any, b: any) =>
        (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99) ||
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      )
      const roleData = (store_id
        ? sortedRoles.find((r: any) => r.store_id === store_id)
        : sortedRoles[0]) as any

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: 'This account is not linked to this store' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const pinMatches = String(roleData.pin || '').trim() === passwordValue
      if (!authPasswordValid && !pinMatches) {
        await supabaseAdmin.rpc('log_login_attempt', {
          p_identifier: normalizedEmail, p_type: 'staff', p_success: false, p_ip: clientIp
        })
        return new Response(
          JSON.stringify({ error: 'Invalid email or password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // If store_id provided, verify match
      if (store_id && roleData.store_id !== store_id) {
        return new Response(
          JSON.stringify({ error: 'This account is not linked to this store' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: storeData } = roleData.store_id
        ? await supabaseAdmin
            .from('stores')
            .select('id, name, outlet_code, address, phone, customer_id, merchant_id')
            .eq('id', roleData.store_id)
            .maybeSingle()
        : { data: null }

      await supabaseAdmin.rpc('log_login_attempt', {
        p_identifier: normalizedEmail, p_type: 'staff', p_success: true, p_ip: clientIp
      })

      const staffName = foundUser.user_metadata?.full_name || 'Staff'

      return new Response(
        JSON.stringify({
          success: true,
          user_id: foundUser.id,
          staff_role_id: roleData.id,
          role_id: roleData.id,
          email: normalizedEmail,
          name: staffName,
          role: roleData.role,
          store_id: roleData.store_id,
          customer_id: roleData.customer_id,
          staff_code: roleData.staff_code,
          ref_code: roleData.ref_code,
          store_name: storeData?.name || null,
          store_address: storeData?.address || null,
          store_phone: storeData?.phone || null,
          store_code: storeData?.outlet_code || null,
          merchant_id: storeData?.merchant_id || roleData.customer_id || null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Legacy: staff_code + PIN (kept for backward compatibility but deprecated)
    if (staff_code && password) {
      const sanitizedCode = staff_code.trim().toUpperCase()
      const sanitizedPin = password.trim()

      const isValidCode = /^[0-9]{8}$/.test(sanitizedCode) || /^(STF|MGR)[0-9]{5}$/i.test(sanitizedCode)
      if (!isValidCode) {
        return new Response(
          JSON.stringify({ error: 'Invalid Staff ID format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'

      const { data: rateLimitOk } = await supabaseAdmin.rpc('check_rate_limit', { 
        p_identifier: sanitizedCode, p_type: 'staff', p_max_attempts: 5, p_window_minutes: 15
      })

      if (rateLimitOk === false) {
        return new Response(
          JSON.stringify({ error: 'Too many attempts. Try again in 15 minutes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: roleRows, error: roleLookupError } = await supabaseAdmin
        .from('user_roles')
        .select('id, user_id, role, store_id, customer_id, merchant_id, staff_code, ref_code, pin, is_active, created_at')
        .or(`staff_code.eq.${sanitizedCode},ref_code.eq.${sanitizedCode}`)
        .in('role', ['staff', 'store_manager', 'cashier'])

      const isActiveStatus = (value: unknown) => {
        if (value === false) return false
        if (value === true || value === null || value === undefined) return true
        return ['true', '1', 'active', 'enabled', 'approved'].includes(String(value).toLowerCase().trim())
      }

      const rolePriority: Record<string, number> = { store_manager: 1, staff: 2, cashier: 3 }
      const roleData = (roleRows || [])
        .filter((row: any) => isActiveStatus(row.is_active))
        .filter((row: any) => String(row.pin || '').trim() === sanitizedPin)
        .sort((a: any, b: any) =>
          (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99) ||
          String(b.created_at || '').localeCompare(String(a.created_at || ''))
        )[0]

      if (roleLookupError || !roleData?.user_id) {
        await supabaseAdmin.rpc('log_login_attempt', {
          p_identifier: sanitizedCode, p_type: 'staff', p_success: false, p_ip: clientIp
        })
        return new Response(
          JSON.stringify({ error: 'Invalid Staff ID or PIN' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(roleData.user_id)
      const staffEmail = userData?.user?.email || ''
      const staffName = userData?.user?.user_metadata?.full_name || 'Staff'

      const { data: storeData } = roleData.store_id
        ? await supabaseAdmin
            .from('stores')
            .select('id, name, outlet_code, address, phone, customer_id, merchant_id')
            .eq('id', roleData.store_id)
            .maybeSingle()
        : { data: null }

      await supabaseAdmin.rpc('log_login_attempt', {
        p_identifier: sanitizedCode, p_type: 'staff', p_success: true, p_ip: clientIp
      })

      return new Response(
        JSON.stringify({
          success: true,
          user_id: roleData.user_id,
          staff_role_id: roleData.id,
          role_id: roleData.id,
          email: staffEmail,
          name: staffName,
          role: roleData.role,
          store_id: roleData.store_id,
          customer_id: roleData.customer_id,
          staff_code: roleData.staff_code,
          ref_code: roleData.ref_code,
          store_name: storeData?.name || null,
          store_address: storeData?.address || null,
          store_phone: storeData?.phone || null,
          store_code: storeData?.outlet_code || null,
          merchant_id: storeData?.merchant_id || roleData.merchant_id || roleData.customer_id || null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Email and password are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
