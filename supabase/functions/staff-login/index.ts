import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const isActiveStatus = (value: unknown) => {
  if (value === false) return false
  if (value === true || value === null || value === undefined) return true
  return ['true', '1', 'active', 'enabled', 'approved'].includes(String(value).toLowerCase().trim())
}

const pinCandidatesFor = (value: string) => Array.from(new Set([
  value,
  /^\d+$/.test(value) ? `${value}Aa@1` : '',
  /^\d+$/.test(value) ? `${value}#MaxoraPOS!26@Auth` : '',
  value.endsWith('Aa@1') ? value.slice(0, -4) : '',
  value.endsWith('#MaxoraPOS!26@Auth') ? value.slice(0, -18) : '',
].filter(Boolean)))

const rolePriority: Record<string, number> = { store_manager: 1, staff: 2, cashier: 3 }

const buildPasswordAttempts = (value: string) => Array.from(new Set([
  value,
  /^\d+$/.test(value) ? `${value}Aa@1` : '',
  /^\d+$/.test(value) ? `${value}#MaxoraPOS!26@Auth` : '',
].filter(Boolean)))

const signInStaffSession = async (supabaseUrl: string, supabaseAnonKey: string, email: string, passwordAttempts: string[]) => {
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })

  for (const candidate of passwordAttempts) {
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password: candidate,
    })
    if (!error && data?.session) {
      return { session: data.session, passwordUsed: candidate, error: null }
    }
  }

  return { session: null, passwordUsed: null, error: 'Invalid login credentials' }
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

      console.log('[STAFF_AUTH] LOGIN START supabase/functions/staff-login/index.ts:73', { identifier: normalizedEmail, mode: 'email' })

      // Verify the supplied password/PIN. Older staff records store the operator
      // PIN in user_roles.pin while Auth password may have been created with a
      // compatibility suffix; accept all known formats so existing staff can log in.
      const passwordValue = String(password).trim()
      const passwordAttempts = buildPasswordAttempts(passwordValue)

      let authPasswordValid = false
      let staffSession: unknown = null
      const initialSignIn = await signInStaffSession(supabaseUrl, supabaseAnonKey, normalizedEmail, passwordAttempts)
      if (initialSignIn.session) {
        authPasswordValid = true
        staffSession = initialSignIn.session
      }

      // Verify the user has an active staff/store_manager role. Use an array and
      // choose deterministically because legacy duplicate rows can make maybeSingle fail.
      const { data: roleRows, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('id, user_id, role, store_id, customer_id, merchant_id, staff_code, ref_code, pin, is_active, created_at')
        .eq('user_id', foundUser.id)
        .in('role', ['staff', 'store_manager', 'cashier'])

      const activeEmailRoleRows = (roleRows || []).filter((row: any) => isActiveStatus(row.is_active))

      if (roleError || activeEmailRoleRows.length === 0) {
        await supabaseAdmin.rpc('log_login_attempt', {
          p_identifier: normalizedEmail, p_type: 'staff', p_success: false, p_ip: clientIp
        })
        return new Response(
          JSON.stringify({ error: 'No active staff account found for this email' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const sortedRoles = activeEmailRoleRows.slice().sort((a: any, b: any) =>
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

      let pinMatches = pinCandidatesFor(passwordValue).some((candidate) => String(roleData.pin || '').trim() === candidate)

      if (!pinMatches) {
        for (const code of [roleData.staff_code, roleData.ref_code].filter(Boolean)) {
          for (const candidate of pinCandidatesFor(passwordValue)) {
            const { data: verifiedRows } = await supabaseAdmin
              .rpc('verify_staff_pin', { p_staff_code: code, p_pin: candidate })
            const verified = Array.isArray(verifiedRows) ? verifiedRows[0] : null
            if (verified?.user_id === roleData.user_id) {
              pinMatches = true
              break
            }
          }
          if (pinMatches) break
        }
      }

      if (!authPasswordValid && !pinMatches) {
        console.warn('[STAFF_AUTH] AUTH FAILED supabase/functions/staff-login/index.ts:148', { user_id: foundUser.id, reason: 'password_and_pin_mismatch' })
        await supabaseAdmin.rpc('log_login_attempt', {
          p_identifier: normalizedEmail, p_type: 'staff', p_success: false, p_ip: clientIp
        })
        return new Response(
          JSON.stringify({ error: 'Invalid email or password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Permanent repair: if the staff PIN is valid but the auth password is out of sync
      // (legacy suffix mismatch or recreated staff user), reset the auth password to
      // the canonical value and issue a real client session. This removes the local-only
      // staff login workaround and stops post-login redirects back to /auth.
      if (!staffSession && pinMatches && /^\d+$/.test(passwordValue)) {
        const canonicalPassword = `${passwordValue}Aa@1`
        const { error: repairError } = await supabaseAdmin.auth.admin.updateUserById(foundUser.id, {
          password: canonicalPassword,
        })
        if (!repairError) {
          const repairedSignIn = await signInStaffSession(supabaseUrl, supabaseAnonKey, normalizedEmail, [canonicalPassword])
          if (repairedSignIn.session) {
            authPasswordValid = true
            staffSession = repairedSignIn.session
            console.log('[STAFF_AUTH] AUTH PASSWORD REPAIRED supabase/functions/staff-login/index.ts:177', { user_id: foundUser.id })
          }
        } else {
          console.warn('[STAFF_AUTH] AUTH PASSWORD REPAIR FAILED supabase/functions/staff-login/index.ts:180', { user_id: foundUser.id, error: repairError.message })
        }
      }

      if (!staffSession) {
        console.warn('[STAFF_AUTH] SESSION LOST supabase/functions/staff-login/index.ts:185', { user_id: foundUser.id, reason: 'unable_to_create_session' })
        return new Response(
          JSON.stringify({ error: 'Staff credentials verified, but session could not be created. Please reset this staff PIN.' }),
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

      if (!storeData?.id) {
        console.warn('[STAFF_AUTH] STORE NOT FOUND supabase/functions/staff-login/index.ts:198', { user_id: foundUser.id, store_id: roleData.store_id })
        return new Response(
          JSON.stringify({ error: 'Store not found for this staff account' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await supabaseAdmin.rpc('log_login_attempt', {
        p_identifier: normalizedEmail, p_type: 'staff', p_success: true, p_ip: clientIp
      })

      const staffName = foundUser.user_metadata?.full_name || 'Staff'

      console.log('[STAFF_AUTH] LOGIN SUCCESS supabase/functions/staff-login/index.ts:207', {
        auth_user_id: foundUser.id,
        role: roleData.role,
        store_id: roleData.store_id,
        merchant_id: storeData?.merchant_id || roleData.merchant_id || roleData.customer_id || null,
      })

      return new Response(
        JSON.stringify({
          success: true,
          session: staffSession,
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

      console.log('[STAFF_AUTH] LOGIN START supabase/functions/staff-login/index.ts:228', { identifier: sanitizedCode, mode: 'staff_code' })

      const isValidCode = /^[0-9]{8}$/.test(sanitizedCode) || /^(STF|MGR|CSH)[0-9]{5}$/i.test(sanitizedCode)
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

      const rolePriority: Record<string, number> = { store_manager: 1, staff: 2, cashier: 3 }
      const activeRoleRows = (roleRows || [])
        .filter((row: any) => isActiveStatus(row.is_active))
        .sort((a: any, b: any) =>
          (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99) ||
          String(b.created_at || '').localeCompare(String(a.created_at || ''))
        )

      let roleData = activeRoleRows.find((row: any) => pinCandidatesFor(sanitizedPin).some((candidate) => String(row.pin || '').trim() === candidate))

      if (!roleData) {
        for (const row of activeRoleRows as any[]) {
          for (const code of [sanitizedCode, row.staff_code, row.ref_code].filter(Boolean)) {
            for (const candidate of pinCandidatesFor(sanitizedPin)) {
              const { data: verifiedRows } = await supabaseAdmin
                .rpc('verify_staff_pin', { p_staff_code: code, p_pin: candidate })
              const verified = Array.isArray(verifiedRows) ? verifiedRows[0] : null
              if (verified?.user_id === row.user_id) {
                roleData = row
                break
              }
            }
            if (roleData) break
          }
          if (roleData) break
        }
      }

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

      if (!staffEmail) {
        console.warn('[STAFF_AUTH] AUTH FAILED supabase/functions/staff-login/index.ts:281', { user_id: roleData.user_id, reason: 'missing_auth_email' })
        return new Response(
          JSON.stringify({ error: 'Staff auth account is missing an email' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      let staffSession: unknown = null
      const initialSignIn = await signInStaffSession(supabaseUrl, supabaseAnonKey, staffEmail.toLowerCase(), buildPasswordAttempts(sanitizedPin))
      if (initialSignIn.session) {
        staffSession = initialSignIn.session
      } else if (/^\d+$/.test(sanitizedPin)) {
        const canonicalPassword = `${sanitizedPin}Aa@1`
        const { error: repairError } = await supabaseAdmin.auth.admin.updateUserById(roleData.user_id, {
          password: canonicalPassword,
        })
        if (!repairError) {
          const repairedSignIn = await signInStaffSession(supabaseUrl, supabaseAnonKey, staffEmail.toLowerCase(), [canonicalPassword])
          if (repairedSignIn.session) {
            staffSession = repairedSignIn.session
            console.log('[STAFF_AUTH] AUTH PASSWORD REPAIRED supabase/functions/staff-login/index.ts:303', { user_id: roleData.user_id })
          }
        } else {
          console.warn('[STAFF_AUTH] AUTH PASSWORD REPAIR FAILED supabase/functions/staff-login/index.ts:306', { user_id: roleData.user_id, error: repairError.message })
        }
      }

      if (!staffSession) {
        console.warn('[STAFF_AUTH] SESSION LOST supabase/functions/staff-login/index.ts:312', { user_id: roleData.user_id, reason: 'unable_to_create_session' })
        return new Response(
          JSON.stringify({ error: 'Staff PIN verified, but session could not be created. Please reset this staff PIN.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: storeData } = roleData.store_id
        ? await supabaseAdmin
            .from('stores')
            .select('id, name, outlet_code, address, phone, customer_id, merchant_id')
            .eq('id', roleData.store_id)
            .maybeSingle()
        : { data: null }

      if (!storeData?.id) {
        console.warn('[STAFF_AUTH] STORE NOT FOUND supabase/functions/staff-login/index.ts:326', { user_id: roleData.user_id, store_id: roleData.store_id })
        return new Response(
          JSON.stringify({ error: 'Store not found for this staff account' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await supabaseAdmin.rpc('log_login_attempt', {
        p_identifier: sanitizedCode, p_type: 'staff', p_success: true, p_ip: clientIp
      })

      console.log('[STAFF_AUTH] LOGIN SUCCESS supabase/functions/staff-login/index.ts:337', {
        auth_user_id: roleData.user_id,
        role: roleData.role,
        store_id: roleData.store_id,
        merchant_id: storeData?.merchant_id || roleData.merchant_id || roleData.customer_id || null,
      })

      return new Response(
        JSON.stringify({
          success: true,
          session: staffSession,
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
