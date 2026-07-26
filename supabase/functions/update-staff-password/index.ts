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
      return new Response(JSON.stringify({ error: 'Authorization header is required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authUserError } = await supabaseAdmin.auth.getUser(token)
    if (authUserError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const { user_id, pin } = body

    if (!user_id || !pin) {
      return new Response(JSON.stringify({ error: 'user_id and pin are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check if caller is super_admin, admin, owner, or merchant
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role, customer_id, merchant_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const isAllowed = (roles || []).some(r => ['super_admin', 'admin', 'owner', 'merchant'].includes(r.role))
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges to update staff passwords' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Prepare password
    const newPassword = /^\d{4}$/.test(String(pin)) ? String(pin) + "Aa@1" : String(pin)

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: newPassword
    })

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Unexpected error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
