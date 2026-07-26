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
    const { staff_id, role_id, store_login_id, store_code } = body
    const targetId = staff_id || role_id

    if (!targetId) {
      return new Response(
        JSON.stringify({ error: 'Staff ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get staff role data first to know the store. Some callers pass a user_roles.id,
    // while older UI paths pass staff.id, so support both without falling back to soft-delete.
    let { data: staffData, error: staffError } = await supabaseAdmin
      .from('user_roles')
      .select('id, user_id, role, store_id, customer_id, merchant_id')
      .eq('id', targetId)
      .maybeSingle()

    if (!staffData) {
      const { data: staffRow, error: staffRowError } = await supabaseAdmin
        .from('staff')
        .select('id, user_id, profile_id, store_id, customer_id')
        .eq('id', targetId)
        .maybeSingle()

      if (staffRowError) staffError = staffRowError

      const linkedUserId = staffRow?.user_id || staffRow?.profile_id
      if (linkedUserId) {
        let roleQuery = supabaseAdmin
          .from('user_roles')
          .select('id, user_id, role, store_id, customer_id, merchant_id')
          .eq('user_id', linkedUserId)
          .in('role', ['staff', 'store_manager', 'cashier'])
          .order('created_at', { ascending: false })
          .limit(1)

        if (staffRow?.store_id) roleQuery = roleQuery.eq('store_id', staffRow.store_id)

        const { data: roleRows, error: roleLookupError } = await roleQuery
        if (roleLookupError) staffError = roleLookupError
        staffData = Array.isArray(roleRows) ? roleRows[0] : roleRows

        if (!staffData && staffRow) {
          staffData = {
            id: targetId,
            user_id: linkedUserId,
            role: 'staff',
            store_id: staffRow.store_id,
            customer_id: staffRow.customer_id,
            merchant_id: staffRow.customer_id,
          }
        }
      }
    }

    if (staffError || !staffData) {
      return new Response(
        JSON.stringify({ error: 'Staff not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Authentication: JWT or store_code ---
    let authorized = false

    const authHeader = req.headers.get('Authorization')
    if (authHeader && authHeader !== 'Bearer null' && !authHeader.endsWith('undefined')) {
      const token = authHeader.replace('Bearer ', '')
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
        if (!error && user) {
          const { data: roleData } = await supabaseAdmin
            .from('user_roles')
            .select('role, customer_id, merchant_id, store_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .in('role', ['admin', 'super_admin', 'owner', 'merchant', 'store_manager'])
            .limit(1)
            .maybeSingle()

          if (roleData) {
            if (roleData.role === 'admin' || roleData.role === 'super_admin') {
              authorized = true
            } else if (roleData.role === 'owner' || roleData.role === 'merchant') {
              // Owner/merchant can delete staff in their own merchant/customer stores.
              const { data: store } = await supabaseAdmin
                .from('stores').select('customer_id, merchant_id, owner_id, created_by').eq('id', staffData.store_id).maybeSingle()
              if (store && (
                (roleData.customer_id && roleData.customer_id === store.customer_id) ||
                (roleData.merchant_id && roleData.merchant_id === store.merchant_id) ||
                (roleData.customer_id && roleData.customer_id === staffData.customer_id) ||
                (roleData.merchant_id && roleData.merchant_id === staffData.merchant_id) ||
                store.owner_id === user.id ||
                store.created_by === user.id
              )) authorized = true
            } else if (roleData.role === 'store_manager' && roleData.store_id === staffData.store_id) {
              authorized = true
            }
          }
        }
      } catch {}
    }

    // Fallback: store_code auth for store-login sessions
    if (!authorized && store_login_id && store_code) {
      const { data: storeData } = await supabaseAdmin
        .from('stores')
        .select('id, store_code')
        .eq('id', store_login_id)
        .eq('is_active', true)
        .maybeSingle()

      if (storeData && storeData.store_code === store_code && store_login_id === staffData.store_id) {
        authorized = true
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Deleting staff (hard delete):', targetId, 'user:', staffData.user_id)

    const userIdToPurge = staffData.user_id

    // Delete dependent rows first to avoid FK violations that would otherwise
    // make the delete look like a soft "inactive" flip in the UI.
    if (userIdToPurge) {
      // staff_attendance references staff.id; delete staff row cascades? Be explicit.
      const { data: staffRows } = await supabaseAdmin
        .from('staff')
        .select('id')
        .or(`user_id.eq.${userIdToPurge},profile_id.eq.${userIdToPurge}`)
      const staffIds = (staffRows || []).map((r: any) => r.id).filter(Boolean)
      if (staffIds.length > 0) {
        await supabaseAdmin.from('staff_attendance').delete().in('staff_id', staffIds)
        await supabaseAdmin.from('staff').delete().in('id', staffIds)
      }
    }

    // Delete all staff-like roles for this user. This removes legacy auto-created
    // cashier rows without deleting privileged owner/admin roles if the same auth user has them.
    const { error: deleteRoleError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userIdToPurge)
      .in('role', ['staff', 'store_manager', 'cashier'])

    if (deleteRoleError) {
      console.error('Failed to delete user_roles:', deleteRoleError)
      return new Response(
        JSON.stringify({ error: `Failed to delete staff: ${deleteRoleError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: remainingRoles } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userIdToPurge)
      .limit(1)

    const shouldDeleteAuthUser = !remainingRoles || remainingRoles.length === 0

    if (shouldDeleteAuthUser) {
      // Delete profile row (best-effort)
      await supabaseAdmin.from('profiles').delete().eq('id', userIdToPurge)

      // Also delete the auth user
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userIdToPurge)
      if (deleteAuthError) {
        console.error('Error deleting auth user:', deleteAuthError)
      }
    }

    console.log('Staff deleted successfully')

    return new Response(
      JSON.stringify({ success: true, message: 'Staff deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
