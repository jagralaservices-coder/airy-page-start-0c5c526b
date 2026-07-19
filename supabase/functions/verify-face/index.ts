import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireFeature, requireResolvedStoreFeature } from "../_shared/checkFeature.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to parse status robustly
const isActiveStatus = (status: any) => {
  if (status === true) return true;
  if (status === false || status === null || status === undefined) return false;
  return ['true', '1', 'active', 'enabled', 'approved'].includes(String(status).toLowerCase().trim());
}

async function authenticateRequest(req: Request, supabaseAdmin: any, store_code?: string, store_id?: string): Promise<{ authorized: boolean; error?: string; userId?: string; token?: string }> {
  const authHeader = req.headers.get('Authorization')
  console.log('[EVIDENCE] 1. Authorization header received:', authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : 'null');
  if (authHeader && authHeader !== 'Bearer null' && !authHeader.endsWith('undefined')) {
    const token = authHeader.replace('Bearer ', '')
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token)
      if (!error && data?.user) {
        console.log('[EVIDENCE] 2. Decoded JWT user id:', data.user.id);
        return { authorized: true, userId: data.user.id, token }
      }
    } catch (e) {
      console.error('authenticateRequest error:', e instanceof Error ? e.message : String(e));
    }
  }
  // Do not attempt to authorize using frontend-provided store credentials here.
  // Always require a valid Supabase auth token and return the user id.
  return { authorized: false, error: 'Authentication required' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Request received');

    // 10. Verify all environment variables.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !LOVABLE_API_KEY) {
      throw new Error('Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY)');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { capturedFaceBase64, storedFaceUrl, store_code, store_id, merchant_id, staff_id, staff_role_id, latitude, longitude, isCheckOut } = body;
    console.log('verify-face input:', { store_code, store_id, merchant_id, staff_id, staff_role_id, isCheckOut });

    if (!capturedFaceBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing capturedFaceBase64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verify merchant authentication.
    const auth = await authenticateRequest(req, supabaseAdmin, store_code, store_id);
    if (!auth.authorized) {
      console.warn('[verify-face] authentication failed', { error: auth.error });
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!auth.userId) {
      console.warn('[verify-face] missing user id after authentication');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: missing user ID' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Resolve authenticated user -> staff record -> merchant -> store
    console.log('[verify-face] auth user id:', auth.userId);
    console.log('[verify-face] raw request body lookup hint:', { store_id, store_code, merchant_id });

    let merchantId: any = null;
    let finalStoreId: any = null;
    let storeFound = false;
    let staffRec: any = null;
    let roleRec: any = null;
    let resolvedStore: any = null;
    const attemptedLookups: any[] = [];

    const selectAttendance = 'id,staff_id,user_id,merchant_id,organization_id,store_id,check_in,check_in_time,check_out,check_out_time,check_in_distance,check_out_distance,status,attendance_date';

    // Helper to log SQL intent and results
    const logSql = (sql: string, result: any, err: any) => {
      console.log('[verify-face] SQL:', sql);
      console.log('[verify-face] SQL result:', result);
      if (err) console.error('[verify-face] SQL error:', err);
      attemptedLookups.push({ sql, result, error: err ? String(err) : null });
    };

    // Prefer the exact user_roles row sent by the app for biometric settings only.
    // Attendance.staff_id MUST reference public.staff.id, never auth/profile/user_roles ids.
    if (staff_role_id) {
      try {
        const sql = `SELECT id, store_id, customer_id, merchant_id, user_id, role, face_photo_url, is_active FROM public.user_roles WHERE id = '${staff_role_id}' LIMIT 1`;
        const { data: roleById, error: roleByIdErr } = await supabaseAdmin
          .from('user_roles')
          .select('id,store_id,customer_id,merchant_id,user_id,role,face_photo_url,is_active')
          .eq('id', staff_role_id)
          .maybeSingle();
        logSql(sql, roleById, roleByIdErr);
        if (roleById && isActiveStatus(roleById.is_active) && roleById.user_id === auth.userId) {
          roleRec = roleById;
          console.log('[verify-face] role record resolved by staff_role_id', roleRec);
        }
      } catch (e) {
        console.error('[verify-face] exception during user_roles id lookup', e);
      }
    }

    // Try user_roles (common application store->staff mapping) for store/merchant/face settings.
    try {
      const targetUserId = auth.userId;
      const requestedStoreFilter = store_id ? ` AND store_id = '${store_id}'` : '';
      const sql = `SELECT id, store_id, customer_id, merchant_id, user_id, role, face_photo_url, is_active FROM public.user_roles WHERE user_id = '${targetUserId}' AND role IN ('staff','store_manager','cashier')${requestedStoreFilter} ORDER BY created_at DESC LIMIT 1`;
      const { data: urDataRows, error: urErr } = await supabaseAdmin
        .from('user_roles')
        .select('id,store_id,customer_id,merchant_id,user_id,role,face_photo_url,is_active')
        .eq('user_id', targetUserId)
        .in('role', ['staff', 'store_manager', 'cashier'])
        .match(store_id ? { store_id } : {})
        .order('created_at', { ascending: false })
      logSql(sql, urDataRows, urErr);
      if (urErr) {
        if (String(urErr.message || '').toLowerCase().includes('policy') || String(urErr.message || '').toLowerCase().includes('permission')) {
          return new Response(JSON.stringify({ success: false, error: 'Staff record blocked by RLS', auth_uid: auth.userId, lookup_stage: 'user_roles' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
      const activeRows = (urDataRows || []).filter((r: any) => isActiveStatus(r.is_active));
      if (!roleRec && activeRows.length > 0) {
        roleRec = activeRows[0];
        console.log('[EVIDENCE] 4. Staff role returned from database:', roleRec);
      } else {
        console.log('[EVIDENCE] 4. Staff role returned from database:', roleRec || 'NO ACTIVE ROWS FOUND');
      }
    } catch (e) {
      console.error('[verify-face] exception during user_roles lookup', e);
    }

    const ensureStaffEmployeeRow = async (role: any) => {
      if (!role?.user_id || !role?.store_id) return null;

      const { data: storeForRole, error: storeForRoleErr } = await supabaseAdmin
        .from('stores')
        .select('id,customer_id,merchant_id,outlet_code,is_active')
        .eq('id', role.store_id)
        .maybeSingle();
      logSql(`SELECT id,customer_id,merchant_id,outlet_code,is_active FROM public.stores WHERE id = '${role.store_id}' LIMIT 1`, storeForRole, storeForRoleErr);

      if (storeForRoleErr || !storeForRole?.id) return null;

      const resolvedCustomerId = role.customer_id || storeForRole.customer_id || storeForRole.merchant_id || role.merchant_id || null;
      if (!resolvedCustomerId) return null;

      let { data: existingRows, error: existingErr } = await supabaseAdmin
        .from('staff')
        .select('id,user_id,profile_id,store_id,customer_id,active,approval_status')
        .or(`user_id.eq.${role.user_id},profile_id.eq.${role.user_id}`)
        .eq('store_id', role.store_id)
        .order('created_at', { ascending: false })
        .limit(1);
      logSql(`SELECT id,user_id,profile_id,store_id,customer_id,active,approval_status FROM public.staff WHERE (user_id = '${role.user_id}' OR profile_id = '${role.user_id}') AND store_id = '${role.store_id}' ORDER BY created_at DESC LIMIT 1`, existingRows, existingErr);

      if (existingErr) return null;
      let existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

      if (!existing?.id) {
        const { data: fallbackRows, error: fallbackErr } = await supabaseAdmin
          .from('staff')
          .select('id,user_id,profile_id,store_id,customer_id,active,approval_status')
          .or(`user_id.eq.${role.user_id},profile_id.eq.${role.user_id}`)
          .order('created_at', { ascending: false })
          .limit(1);
        logSql(`SELECT id,user_id,profile_id,store_id,customer_id,active,approval_status FROM public.staff WHERE (user_id = '${role.user_id}' OR profile_id = '${role.user_id}') ORDER BY created_at DESC LIMIT 1`, fallbackRows, fallbackErr);
        if (fallbackErr) return null;
        existing = Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows;
      }

      if (existing?.id) {
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('staff')
          .update({
            user_id: role.user_id,
            profile_id: role.user_id,
            store_id: role.store_id,
            customer_id: resolvedCustomerId,
            position: role.role || 'staff',
            active: true,
            approval_status: 'approved',
          })
          .eq('id', existing.id)
          .select('id,user_id,profile_id,store_id,customer_id,active,approval_status')
          .maybeSingle();
        logSql(`UPDATE public.staff SET user_id/profile_id/store/customer active approved WHERE id = '${existing.id}'`, updated, updateErr);
        return updated || existing;
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('staff')
        .insert({
          profile_id: role.user_id,
          user_id: role.user_id,
          store_id: role.store_id,
          customer_id: resolvedCustomerId,
          position: role.role || 'staff',
          active: true,
          approval_status: 'approved',
        })
        .select('id,user_id,profile_id,store_id,customer_id,active,approval_status')
        .maybeSingle();
      logSql(`INSERT public.staff profile/store/customer for user '${role.user_id}'`, inserted, insertErr);
      return inserted || null;
    };

    // Resolve the actual staff employee row. This is the only valid attendance.staff_id.
    try {
      const resolvedStoreHint = store_id || roleRec?.store_id || null;
      let staffQuery = supabaseAdmin
        .from('staff')
        .select('id,user_id,profile_id,store_id,customer_id,active,approval_status')
        .or(`user_id.eq.${auth.userId},profile_id.eq.${auth.userId}`)
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (resolvedStoreHint) staffQuery = staffQuery.eq('store_id', resolvedStoreHint);

      const sql = `SELECT id,user_id,profile_id,store_id,customer_id,active,approval_status FROM public.staff WHERE (user_id = '${auth.userId}' OR profile_id = '${auth.userId}')${resolvedStoreHint ? ` AND store_id = '${resolvedStoreHint}'` : ''} AND active = true ORDER BY created_at DESC`;
      const { data: staffRows, error: staffErr } = await staffQuery;
      logSql(sql, staffRows, staffErr);
      const activeStaffRows = (staffRows || []).filter((row: any) => ['approved', 'active', ''].includes(String(row.approval_status || 'approved').toLowerCase()));
      staffRec = activeStaffRows[0] || null;
    } catch (e) {
      console.error('[verify-face] exception during staff table lookup', e instanceof Error ? e.message : String(e));
    }

    if (!staffRec && roleRec) {
      console.warn('[verify-face] staff row missing; attempting repair from active role');
      staffRec = await ensureStaffEmployeeRow(roleRec);
    }

    if (!staffRec?.id) {
      console.warn('[EVIDENCE] 9. Exact line where Staff record not found is returned: index.ts line 161 (after exhausting all lookups)');
      return new Response(JSON.stringify({ success: false, error: 'Staff record not found', auth_uid: auth.userId, staff_id: null, merchant_id: null, store_id: null, lookup_stage: 'no-staff-record', attemptedLookups }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[EVIDENCE] 5. merchant_id:', staffRec.customer_id || roleRec?.customer_id || roleRec?.merchant_id || merchant_id);
    console.log('[EVIDENCE] 6. store_id:', staffRec.store_id || roleRec?.store_id || store_id);
    // Derive merchant id from staff record fields
    merchantId = staffRec.customer_id || roleRec?.customer_id || roleRec?.merchant_id || null;
    const staffProvidedStoreId = staffRec.store_id || roleRec?.store_id || null;

    console.log('[verify-face] derived merchant_id from staff record:', merchantId);

    // Resolve store: prefer staff.store_id, then merchant->stores mapping
    try {
      if (staffProvidedStoreId) {
        const sql = `SELECT id,customer_id,merchant_id,outlet_code,is_active FROM public.stores WHERE id = '${staffProvidedStoreId}' LIMIT 1`;
        const { data: sByStaff, error: sByStaffErr } = await supabaseAdmin.from('stores').select('id,customer_id,merchant_id,outlet_code,is_active').eq('id', staffProvidedStoreId).maybeSingle();
        logSql(sql, sByStaff, sByStaffErr);
        if (sByStaff) {
          finalStoreId = sByStaff.id;
          merchantId = merchantId || sByStaff.customer_id || sByStaff.merchant_id || null;
          resolvedStore = sByStaff;
          storeFound = true;
          console.log('[verify-face] store resolved from staff.store_id', sByStaff);
        }
      }
    } catch (e) {
      console.error('[verify-face] exception resolving store from staff.store_id', e);
    }

    if (!storeFound && merchantId) {
      try {
        const sql = `SELECT id,customer_id,merchant_id,outlet_code,is_active FROM public.stores WHERE merchant_id = '${merchantId}' OR customer_id = '${merchantId}' LIMIT 1`;
        const { data: sByMerchant, error: sByMerchantErr } = await supabaseAdmin.from('stores').select('id,customer_id,merchant_id,outlet_code,is_active').or(`merchant_id.eq.${merchantId},customer_id.eq.${merchantId}`).limit(1);
        logSql(sql, sByMerchant, sByMerchantErr);
        if (sByMerchant && Array.isArray(sByMerchant) && sByMerchant.length > 0) {
          const row = sByMerchant[0];
          finalStoreId = row.id;
          storeFound = true;
          resolvedStore = row;
          merchantId = merchantId || row.customer_id || row.merchant_id || null;
          console.log('[verify-face] store resolved from merchant/customer mapping', row);
        }
      } catch (e) {
        console.error('[verify-face] exception resolving store by merchant/customer', e);
      }
    }

    // As a last resort, try request body outlet code. Newer schemas do not have stores.store_code.
    if (!storeFound && store_code) {
      try {
        const sql = `SELECT id,customer_id,merchant_id,outlet_code,is_active FROM public.stores WHERE outlet_code = '${store_code}' LIMIT 1`;
        const { data: sByCode, error: sByCodeErr } = await supabaseAdmin.from('stores').select('id,customer_id,merchant_id,outlet_code,is_active').eq('outlet_code', store_code).limit(1).maybeSingle();
        logSql(sql, sByCode, sByCodeErr);
        if (sByCode) {
          finalStoreId = sByCode.id;
          merchantId = merchantId || sByCode.customer_id || sByCode.merchant_id || null;
          resolvedStore = sByCode;
          storeFound = true;
          console.log('[verify-face] store resolved from outlet_code', sByCode);
        }
      } catch (e) {
        console.error('[verify-face] exception resolving store by code', e);
      }
    }

    if (!storeFound) {
      console.warn('[verify-face] store not resolved after all lookups', { auth_uid: auth.userId, staff_id: staffRec.id, merchant_id: merchantId, attemptedLookups });
      return new Response(JSON.stringify({ success: false, error: 'Store not found', auth_uid: auth.userId, staff_id: staffRec.id || null, merchant_id: merchantId || null, store_id: null, lookup_stage: 'no-store-found', attemptedLookups }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!merchantId) {
      console.warn('[verify-face] merchant not resolved; attendance insert blocked', { auth_uid: auth.userId, staff_id: staffRec.id, store_id: finalStoreId });
      return new Response(JSON.stringify({ success: false, error: 'Merchant not found', auth_uid: auth.userId, staff_id: staffRec.id || null, merchant_id: null, store_id: finalStoreId || null, lookup_stage: 'no-merchant-found', attemptedLookups }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: staffExistsForFk, error: staffExistsErr } = await supabaseAdmin
      .from('staff')
      .select('id,user_id,profile_id,store_id,customer_id,active,approval_status')
      .eq('id', staffRec.id)
      .maybeSingle();
    logSql(`SELECT id,user_id,profile_id,store_id,customer_id,active,approval_status FROM public.staff WHERE id = '${staffRec.id}' LIMIT 1`, staffExistsForFk, staffExistsErr);

    if (staffExistsErr || !staffExistsForFk?.id) {
      console.warn('[verify-face] staff FK validation failed; attendance insert blocked', { auth_uid: auth.userId, resolved_staff_id: staffRec.id, staffExistsErr });
      return new Response(JSON.stringify({ success: false, error: 'Staff record not found', auth_uid: auth.userId, staff_id: staffRec.id || null, merchant_id: merchantId || null, store_id: finalStoreId || null, lookup_stage: 'staff-fk-validation' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    staffRec = { ...staffRec, ...staffExistsForFk };

    console.log('[Attendance Debug] Current auth user id:', auth.userId);
    console.log('[Attendance Debug] Resolved staff.id:', staffRec.id);
    console.log('[Attendance Debug] Resolved merchant id:', merchantId);
    console.log('[Attendance Debug] Resolved store id:', finalStoreId);
    console.log('[verify-face] merchant and store verified', { merchantId, finalStoreId, staffRec });

    // 6. Staff record already resolved earlier; log and validate
    console.log('[verify-face] staff found (resolved earlier)', { staff_id: staffRec.id, staff_user_id: staffRec.user_id, staff_store_id: staffRec.store_id });

    // Feature gate
    const featureGate = resolvedStore
      ? await requireResolvedStoreFeature(req, resolvedStore, "face_attendance")
      : await requireFeature(req, "face_attendance");
    if (featureGate) return featureGate;

    // 7. Verify biometric/photo enrollment exists.
    const actualStoredFaceUrl = storedFaceUrl || roleRec?.face_photo_url;
    if (!actualStoredFaceUrl) {
      console.warn('[verify-face] biometric enrollment missing for staff', { staffId: staffRec.id });
      return new Response(
        JSON.stringify({ success: false, error: 'Biometric enrollment not found', reason: 'no-face-enrollment', staff_id: staffRec.id }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Biometric loaded');

    // Match the dashboard state: any open attendance record must be checked out
    // before a new check-in is allowed. This prevents "already checked in" while
    // the UI still shows the Check In button because of date/time-zone drift.
    const nowForLookup = new Date();
    const todayDate = nowForLookup.toISOString().split('T')[0];
    const { data: existingAtt, error: existingAttErr } = await supabaseAdmin
      .from('staff_attendance')
      .select(selectAttendance)
      .eq('staff_id', staffRec.id)
      .eq('merchant_id', merchantId)
      .eq('store_id', finalStoreId)
      .eq('status', 'checked_in')
      .is('check_out', null)
      .order('check_in', { ascending: false })
      .limit(1);

    if (existingAttErr) throw new Error(`SQL query error (attendance check): ${existingAttErr.message}`);

    if (!isCheckOut) {
      if (existingAtt && existingAtt.length > 0 && existingAtt[0].status === 'checked_in') {
        return new Response(
          JSON.stringify({ success: true, match: true, alreadyCheckedIn: true, message: 'Already checked in', attendance_id: existingAtt[0].id, staff_id: staffRec.id, attendance: existingAtt[0] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      if (!existingAtt || existingAtt.length === 0 || existingAtt[0].status !== 'checked_in') {
         return new Response(
          JSON.stringify({ success: false, error: 'Not checked in yet' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let capturedImageUrl = capturedFaceBase64;
    if (!capturedFaceBase64.startsWith('data:') && !capturedFaceBase64.startsWith('http')) {
      capturedImageUrl = `data:image/jpeg;base64,${capturedFaceBase64}`;
    }

    // 8. Verify Supabase Storage upload succeeds.
    let uploadedFaceUrl = null;
    try {
      const resp = await fetch(capturedImageUrl);
      if (!resp.ok) throw new Error('Failed to parse base64 image data URI');
      const blob = await resp.blob();
      
      const fileName = `attendance/${staffRec.id}/${Date.now()}.jpg`;
      const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
        .from('staff-faces')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
        
      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }
      
      const { data: publicUrlData } = supabaseAdmin.storage.from('staff-faces').getPublicUrl(fileName);
      uploadedFaceUrl = publicUrlData.publicUrl;
    } catch (e) {
      throw new Error(`Storage upload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log('Supabase Storage upload succeeds');

    console.log('Face comparison started');

    // Helper: fetch any image URL (public or signed) and convert to a data URI Gemini can read.
    // The AI provider fetches URLs itself and fails with 400 on private storage URLs, so we inline both images.
    const toDataUri = async (input: string): Promise<string> => {
      if (!input) throw new Error('Empty image URL');
      if (input.startsWith('data:')) return input;
      // If it's a supabase storage path inside our staff-faces bucket, try to sign it via admin client
      try {
        const marker = '/storage/v1/object/';
        const idx = input.indexOf(marker);
        if (idx !== -1) {
          const rest = input.substring(idx + marker.length); // e.g. public/staff-faces/path.jpg or sign/...
          const parts = rest.split('/');
          // parts[0] = 'public' | 'sign' | 'authenticated'; parts[1] = bucket
          const bucket = parts[1];
          const objectPath = parts.slice(2).join('/');
          if (bucket && objectPath) {
            const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(objectPath, 300);
            if (signed?.signedUrl) input = signed.signedUrl;
          }
        }
      } catch (e) {
        console.warn('[verify-face] signed url fallback failed', e);
      }
      const r = await fetch(input);
      if (!r.ok) throw new Error(`fetch image failed: ${r.status} ${input.substring(0, 120)}`);
      const contentType = r.headers.get('content-type') || 'image/jpeg';
      const buf = new Uint8Array(await r.arrayBuffer());
      // base64 encode
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
      }
      const b64 = btoa(binary);
      return `data:${contentType};base64,${b64}`;
    };

    let storedDataUri: string;
    let capturedDataUri: string;
    try {
      [storedDataUri, capturedDataUri] = await Promise.all([
        toDataUri(actualStoredFaceUrl),
        toDataUri(uploadedFaceUrl!),
      ]);
    } catch (e) {
      console.error('[verify-face] failed to inline images for AI', e);
      return new Response(JSON.stringify({ success: false, error: 'Could not load face images for verification', details: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Strict system + user prompt for Lovable (JSON-only output, >85 confidence required for match)
    const systemPrompt = `You are a strict face-verification assistant. Compare two face images and decide if they belong to the same person. Focus ONLY on facial features (face shape, eyes, nose, mouth, relative positions, skin texture, scars/moles, facial hair, gaps between features). Do NOT use metadata, background, clothing, or scene to decide. If image quality, occlusion, angle, or lighting prevents a reliable decision, return match=false with an explicit reason. Return ONLY a single JSON object — no explanatory text, no markdown, no extra characters. JSON keys must be: "match" (boolean), "confidence" (number 0-100), "reason" (short string). Use confidence as a percentage. Only set match=true when you are highly confident (>85%). Be conservative: prefer false for uncertain cases.`;

    const userPrompt = `Compare these two images. First image is the stored/reference image; second image is the newly captured live image. Return ONLY JSON like: {"match": true|false, "confidence": 0-100, "reason": "brief reason why match/failed (lighting/pose/occlusion/different person/other)"}. If you cannot parse the images or they are corrupt/too small, return match=false and reason "invalid-image" or "low-quality". Keep reason under 80 characters.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
          { role: 'user', content: [ { type: 'image_url', image_url: { url: storedDataUri } }, { type: 'image_url', image_url: { url: capturedDataUri } } ] }
        ],

        max_tokens: 200,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Face verification service error (Lovable API): status ${response.status}, details: ${text}`);
    }

    const aiResponse = await response.json();
    console.log('[verify-face] Lovable raw response:', aiResponse);
    const content = aiResponse.choices?.[0]?.message?.content || '';

    let verificationResult: { match?: boolean; confidence?: number; reason?: string } | null = null;
    try {
      // Strictly extract the first JSON object from the assistant's content
      const jsonMatch = String(content).match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[verify-face] No JSON found in Lovable response content');
        return new Response(JSON.stringify({ success: false, error: 'Face verification parse error', reason: 'no-json-in-response', raw: content }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      verificationResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[verify-face] Failed to parse verification JSON:', e, content);
      return new Response(JSON.stringify({ success: false, error: 'Face verification parse error', reason: 'invalid-json', raw: content }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate parsed structure
    if (typeof verificationResult.match !== 'boolean' || typeof verificationResult.confidence !== 'number') {
      console.error('[verify-face] verification JSON missing required keys', verificationResult);
      return new Response(JSON.stringify({ success: false, error: 'Face verification invalid response', reason: 'missing-keys', parsed: verificationResult }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Enforce confidence threshold (>85) for accepting a match
    const confidence = Number(verificationResult.confidence || 0);
    if (verificationResult.match && confidence <= 85) {
      console.warn('[verify-face] match reported but confidence below threshold', { confidence });
      return new Response(JSON.stringify({ success: false, error: 'Face verification failed', reason: 'confidence-below-threshold', confidence, match: false }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!verificationResult.match) {
      return new Response(
        JSON.stringify({ success: false, error: 'Face verification failed: ' + (verificationResult.reason || 'Faces do not match'), details: verificationResult }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let responseAttendance: any = null;

    if (isCheckOut) {
      const nowIso = new Date().toISOString();
      const { data: updatedAttendance, error: updateErr } = await supabaseAdmin
        .from('staff_attendance')
        .update({
          status: 'checked_out',
          check_out: nowIso,
          check_out_time: nowIso,
          check_out_latitude: latitude || null,
          check_out_longitude: longitude || null
        })
        .eq('id', existingAtt[0].id)
        .select(selectAttendance)
        .maybeSingle();

      if (updateErr) throw new Error(`SQL query error (attendance update): ${updateErr.message}`);
      console.log('Attendance updated (checkout)');
      responseAttendance = updatedAttendance;
    } else {
      const nowIso = new Date().toISOString();
      const attendancePayload = {
        staff_id: staffRec.id,
        user_id: auth.userId,
        store_id: finalStoreId,
        organization_id: merchantId,
        merchant_id: merchantId,
        check_in: nowIso,
        check_in_time: nowIso,
        status: 'checked_in',
        verification_type: 'face',
        verification_method: 'face',
        face_image: uploadedFaceUrl,
        latitude: latitude || null,
        longitude: longitude || null,
        check_in_latitude: latitude || null,
        check_in_longitude: longitude || null,
        attendance_date: nowIso.split('T')[0]
      };

      console.log('[Attendance Debug] Attendance payload:', attendancePayload);
      const { data: insertedAttendance, error: insertErr } = await supabaseAdmin
        .from('staff_attendance')
        .insert(attendancePayload)
        .select(selectAttendance)
        .maybeSingle();

      console.log('[Attendance Debug] Attendance insert result:', insertedAttendance);
      console.error('[Attendance Debug] Attendance insert error:', insertErr);

      if (insertErr) {
        const fkDetails = String(insertErr.message || '') + ' ' + String(insertErr.details || '');
        if (fkDetails.includes('staff_attendance_staff_id_fkey')) {
          return new Response(JSON.stringify({ success: false, error: 'Staff record not found', details: insertErr.message, auth_uid: auth.userId, staff_id: staffRec.id, merchant_id: merchantId, store_id: finalStoreId, lookup_stage: 'attendance-insert-fk' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        throw new Error(`SQL query error (attendance insert): ${insertErr.message}`);
      }
      console.log('Attendance inserted');
      responseAttendance = insertedAttendance;
    }

    console.log('Success returned');
    return new Response(
      JSON.stringify({
        success: true,
        match: true,
        confidence: verificationResult.confidence || 100,
        reason: verificationResult.reason || 'Verification complete',
        attendance: responseAttendance || null
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Exception caught:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        stack: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
