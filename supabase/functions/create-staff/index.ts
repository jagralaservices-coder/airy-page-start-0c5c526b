import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireFeature } from "../_shared/checkFeature.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const gate = await requireFeature(req, "staff_management");
  if (gate) return gate;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const { 
      name, 
      email: providedEmail, 
      role, 
      store_id, 
      customer_id, 
      pin, 
      password: providedPassword, 
      face_photo_url, 
      work_start_time, 
      work_end_time, 
      fingerprint_enabled, 
      salary,
      phone,
      address_line1,
      locality,
      city,
      state,
      pincode,
      aadhaar_number,
      aadhaar_name,
      aadhaar_front_url,
      aadhaar_back_url
    } = body

    // Validate general required fields
    if (!name || !store_id || !providedEmail || !phone) {
      return new Response(
        JSON.stringify({ error: 'Name, email, mobile, and store are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cashier accounts MUST be scoped to a store — reject if missing
    if ((role || 'staff') === 'cashier' && !store_id) {
      return new Response(
        JSON.stringify({ error: 'A store must be selected when creating a cashier account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate complete address fields
    if (!address_line1 || !locality || !city || !state || !pincode) {
      return new Response(
        JSON.stringify({ error: 'Complete address (Address Line 1, Locality, City, State, and Pincode) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Aadhaar verification removed — no longer required


    const staffEmail = providedEmail.trim().toLowerCase()

    // Authenticate and verify role (Only Admin or Owner can create staff)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || authHeader === 'Bearer null') {
      return new Response(
        JSON.stringify({ error: 'Authorization header is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, customer_id')
      .eq('user_id', user.id)
      .in('role', ['admin', 'owner', 'super_admin'])
      .eq('is_active', true)
      .maybeSingle()

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only administrators or owners can create staff accounts' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const effectiveCustomerId = customer_id || roleData.customer_id
    
    if (!effectiveCustomerId) {
      return new Response(
        JSON.stringify({ error: 'Customer ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // PLAN ENFORCEMENT: gate staff creation by merchant_subscription
    if (roleData.role !== 'admin' && roleData.role !== 'super_admin') {
      const { data: sub } = await supabaseAdmin
        .from('merchant_subscription')
        .select('plan_name, staff_limit, extra_staff, expiry_date, status')
        .eq('merchant_id', effectiveCustomerId)
        .maybeSingle()

      const plan = (sub && sub.status === 'active' && new Date(sub.expiry_date) >= new Date())
        ? sub.plan_name : 'basic'

      if (plan === 'basic') {
        return new Response(
          JSON.stringify({ error: 'Upgrade required: Staff Management is a Gold/Platinum feature.', required_plan: 'gold' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const allowedStaff = (sub?.staff_limit || 0) + (sub?.extra_staff || 0)
      const { count: currentStaff } = await supabaseAdmin
        .from('user_roles')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', effectiveCustomerId)
        .eq('role', 'staff')
        .eq('is_active', true)

      if ((currentStaff || 0) >= allowedStaff) {
        return new Response(
          JSON.stringify({ error: `Staff limit reached (${allowedStaff}). Upgrade your plan or purchase extra staff.`, required_plan: plan === 'gold' ? 'platinum' : 'platinum' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    console.log('Creating staff user:', { email: staffEmail, name, role, store_id, customer_id: effectiveCustomerId })

    const generateNumericCode = (length: number) =>
      Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')

    const ensureStaffEmployeeRow = async (params: {
      userId: string
      storeId: string
      customerId: string
      roleName: string
    }) => {
      const { userId: employeeUserId, storeId: employeeStoreId, customerId: employeeCustomerId, roleName } = params

      let { data: existingStaff, error: staffLookupError } = await supabaseAdmin
        .from('staff')
        .select('id, active, approval_status, customer_id, store_id')
        .or(`user_id.eq.${employeeUserId},profile_id.eq.${employeeUserId}`)
        .eq('store_id', employeeStoreId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (staffLookupError) {
        console.error('Staff employee lookup error:', staffLookupError)
        throw new Error(staffLookupError.message)
      }

      let existingStaffRow = Array.isArray(existingStaff) ? existingStaff[0] : existingStaff

      if (!existingStaffRow?.id) {
        const { data: fallbackStaff, error: fallbackStaffError } = await supabaseAdmin
          .from('staff')
          .select('id, active, approval_status, customer_id, store_id')
          .or(`user_id.eq.${employeeUserId},profile_id.eq.${employeeUserId}`)
          .order('created_at', { ascending: false })
          .limit(1)

        if (fallbackStaffError) {
          console.error('Staff employee fallback lookup error:', fallbackStaffError)
          throw new Error(fallbackStaffError.message)
        }

        existingStaffRow = Array.isArray(fallbackStaff) ? fallbackStaff[0] : fallbackStaff
      }

      if (existingStaffRow?.id) {
        const { error: updateStaffError } = await supabaseAdmin
          .from('staff')
          .update({
            user_id: employeeUserId,
            profile_id: employeeUserId,
            store_id: employeeStoreId,
            customer_id: employeeCustomerId,
            position: roleName || 'staff',
            active: true,
            approval_status: 'approved',
          })
          .eq('id', existingStaffRow.id)

        if (updateStaffError) {
          console.error('Staff employee update error:', updateStaffError)
          throw new Error(updateStaffError.message)
        }

        return existingStaffRow.id
      }

      const { data: insertedStaff, error: insertStaffError } = await supabaseAdmin
        .from('staff')
        .insert({
          user_id: employeeUserId,
          profile_id: employeeUserId,
          store_id: employeeStoreId,
          customer_id: employeeCustomerId,
          position: roleName || 'staff',
          active: true,
          approval_status: 'approved',
        })
        .select('id')
        .single()

      if (insertStaffError) {
        console.error('Staff employee insert error:', insertStaffError)
        throw new Error(insertStaffError.message)
      }

      return insertedStaff.id
    }

    // Use provided password first, then pin, then generate one
    const providedPasswordValue = (providedPassword?.trim() || pin?.trim() || '').trim()
    const staffPin = (pin || providedPasswordValue || generateNumericCode(4)).trim()
    
    // Use the provided password/pin as auth password if it's at least 6 chars
    // Otherwise generate a strong one
    const password = providedPasswordValue.length >= 6 
      ? providedPasswordValue 
      : `${crypto.randomUUID()}Aa!1`

    // Try to create auth user, or reuse existing one
    let userId: string

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: staffEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name }
    })

    if (authError) {
      console.log('Auth create error (checking for existing user):', authError.message)
      const errorMessage = authError.message.toLowerCase()
      
      // If user already exists, find and reuse their ID
      if (errorMessage.includes('already') || errorMessage.includes('duplicate') || errorMessage.includes('exists') || errorMessage.includes('database error')) {
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = users?.find(u => u.email?.toLowerCase() === staffEmail)
        
        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: 'Could not find or create user with this email' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        userId = existingUser.id
        console.log('Reusing existing auth user:', userId)
        
        // Update the password so staff can login with the new credentials
        const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { full_name: name }
        })

        if (updateUserError) {
          return new Response(
            JSON.stringify({ error: updateUserError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        // Check if user already has this role (unique constraint is user_id + role)
        const { data: existingRole } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .eq('role', role || 'staff')
          .maybeSingle()
        
        if (existingRole) {
          // Update existing role instead of creating duplicate
          const { data: updatedRole, error: updateError } = await supabaseAdmin
            .from('user_roles')
            .update({
              role: role || 'staff',
              customer_id: effectiveCustomerId,
              merchant_id: effectiveCustomerId,
              store_id: store_id,
              pin: staffPin,
              face_photo_url: face_photo_url || undefined,
              work_start_time: work_start_time || '09:00:00',
              work_end_time: work_end_time || '18:00:00',
              fingerprint_enabled: fingerprint_enabled || false,
              salary: salary || 0,
              is_active: true,
            })

            .eq('id', existingRole.id)
            .select('staff_code')
            .single()
          
          if (updateError) {
            console.error('Role update error:', updateError)
            return new Response(
              JSON.stringify({ error: updateError.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Update profile details
          await supabaseAdmin.from('profiles').update({
            full_name: name,
            phone: phone || null,
            address_line1: address_line1.trim(),
            locality: locality.trim(),
            city: city.trim(),
            state: state.trim(),
            pincode: pincode.trim(),
          }).eq('id', userId)

          const staffEmployeeId = await ensureStaffEmployeeRow({
            userId,
            storeId: store_id,
            customerId: effectiveCustomerId,
            roleName: role || 'staff',
          })
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              staff_code: updatedRole?.staff_code,
              staff_id: staffEmployeeId,
              password,
              pin: staffPin,
              message: `Staff account updated for ${name}`
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } else {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      userId = authData.user.id
    }

    // Create user role
    const plainPin = staffPin
    const plainPassword = password
    const { data: newRole, error: roleInsertError } = await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role: role || 'staff',
      customer_id: effectiveCustomerId,
      merchant_id: effectiveCustomerId,
      store_id,
      pin: staffPin,
      is_active: true,
      face_photo_url: face_photo_url,
      work_start_time: work_start_time || '09:00:00',
      work_end_time: work_end_time || '18:00:00',
      fingerprint_enabled: fingerprint_enabled || false,
      salary: salary || 0,
    }).select('staff_code').single()


    if (roleInsertError) {
      // Only delete user if we just created them
      if (authData?.user) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
      }
      console.error('Role insert error:', roleInsertError)
      return new Response(
        JSON.stringify({ error: roleInsertError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Update profile
    await supabaseAdmin.from('profiles').update({
      full_name: name,
      phone: phone || null,
      address_line1: address_line1.trim(),
      locality: locality.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
    }).eq('id', userId)

    const staffEmployeeId = await ensureStaffEmployeeRow({
      userId,
      storeId: store_id,
      customerId: effectiveCustomerId,
      roleName: role || 'staff',
    })

    console.log('Staff created successfully:', { staff_code: newRole?.staff_code, staff_id: staffEmployeeId, pin: plainPin })

    return new Response(
      JSON.stringify({ 
        success: true, 
        staff_code: newRole?.staff_code,
        staff_id: staffEmployeeId,
        password: plainPassword,
        pin: plainPin,
        message: `Staff account created for ${name}`
      }),

      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
