// Verify a checklist submission using Lovable AI Gateway (Gemini 2.5 Pro).
// - Loads submission + selfies + uniform reference images
// - Sends multimodal prompt asking for per-category JSON scoring
// - Persists ai_verification_results, updates submission status, notifies owners
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const AI_MODEL = 'google/gemini-2.5-pro';
const CATEGORIES = [
  'uniform','hair','shoes','nails','cap','mask','gloves','apron','id_card','face_visible','cleanliness','beard','overall_grooming'
];

const SYSTEM_PROMPT = `You are a strict but fair uniform/grooming compliance auditor for a restaurant chain.
You will receive: (1) one or more official REFERENCE images of the company uniform/cap/apron/shoes, and (2) one or more SUBMITTED live selfies from a staff member.

Your job: score each category from 0-100 based on visible evidence.
Return ONLY valid JSON matching this schema, no prose, no markdown fences:
{
  "categories": {
    "uniform": number, "hair": number, "shoes": number, "nails": number,
    "cap": number, "mask": number, "gloves": number, "apron": number,
    "id_card": number, "face_visible": number, "cleanliness": number,
    "beard": number, "overall_grooming": number
  },
  "overall_score": number,
  "result": "pass" | "fail",
  "reason": "short explanation citing which categories failed and why"
}
Rules:
- If a category is not visible in the image, score it 70 (neutral) and mention "not visible" in reason.
- Overall pass threshold: overall_score >= 75 AND no critical category (uniform, face_visible, cleanliness) below 60.
- Focus on stable, observable evidence. Do not penalize lighting, background, or minor angle variation.
- Do NOT return anything except the JSON object.`;

async function fetchAsBase64(supabase: any, bucket: string, path: string): Promise<{ mime: string; data: string } | null> {
  try {
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (!signed?.signedUrl) return null;
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/jpeg';
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { mime, data: btoa(bin) };
  } catch (_e) { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const submissionId: string | undefined = body.submission_id;
    if (!submissionId) {
      return new Response(JSON.stringify({ error: 'submission_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: submission, error: sErr } = await admin
      .from('checklist_submissions')
      .select('id, merchant_id, staff_user_id, checklist_id, staff_name')
      .eq('id', submissionId)
      .maybeSingle();
    if (sErr || !submission) {
      return new Response(JSON.stringify({ error: 'Submission not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load submitted images (selfie + item photos with ai_verify)
    const { data: images } = await admin
      .from('submission_images')
      .select('id, storage_path, kind')
      .eq('submission_id', submissionId);

    const { data: refs } = await admin
      .from('uniform_reference_images')
      .select('id, storage_path, kind')
      .eq('merchant_id', submission.merchant_id)
      .eq('is_current', true);

    if (!images?.length) {
      return new Response(JSON.stringify({ error: 'No submitted images to verify' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build multimodal content
    const content: any[] = [
      { type: 'text', text: `Reference uniform images (${refs?.length ?? 0}):` },
    ];
    for (const r of refs ?? []) {
      const img = await fetchAsBase64(admin, 'uniform-reference', r.storage_path);
      if (img) content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } });
    }
    content.push({ type: 'text', text: `Submitted staff images (${images.length}):` });
    for (const s of images) {
      const img = await fetchAsBase64(admin, 'staff-checklist', s.storage_path);
      if (img) content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } });
    }
    content.push({ type: 'text', text: 'Now return the JSON verdict only.' });

    // Call Lovable AI Gateway
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'AI rate limit reached. Please retry shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits to continue.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: `AI verification failed: ${errText.slice(0, 300)}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { result: 'fail', reason: 'AI returned invalid JSON', overall_score: 0, categories: {} }; }

    const categories = parsed.categories ?? {};
    for (const k of CATEGORIES) if (typeof categories[k] !== 'number') categories[k] = 70;
    const overall = typeof parsed.overall_score === 'number'
      ? parsed.overall_score
      : Math.round(CATEGORIES.reduce((a, k) => a + (categories[k] ?? 70), 0) / CATEGORIES.length);
    const critical = ['uniform','face_visible','cleanliness'];
    const critFail = critical.some((k) => (categories[k] ?? 0) < 60);
    const result: 'pass' | 'fail' = (parsed.result === 'pass' || parsed.result === 'fail')
      ? parsed.result
      : (overall >= 75 && !critFail ? 'pass' : 'fail');
    const reason: string = parsed.reason ?? '';

    await admin.from('ai_verification_results').insert({
      submission_id: submissionId,
      categories,
      overall_score: overall,
      result,
      reason,
      raw_response: parsed,
      model: AI_MODEL,
    });

    await admin.from('checklist_submissions').update({
      overall_score: overall,
      status: result === 'pass' ? 'ai_pass' : 'ai_fail',
    }).eq('id', submissionId);

    // Notify merchant owners
    const { data: owners } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('customer_id', submission.merchant_id)
      .in('role', ['owner','merchant','admin','store_manager']);
    const recipients = Array.from(new Set((owners ?? []).map((o: any) => o.user_id).filter(Boolean)));
    if (recipients.length) {
      const rows = recipients.map((uid: string) => ({
        user_id: uid,
        merchant_id: submission.merchant_id,
        kind: result === 'pass' ? 'ai_pass' : 'ai_fail',
        title: result === 'pass' ? 'Checklist submitted (AI passed)' : 'Checklist AI verification failed',
        body: `${submission.staff_name ?? 'Staff'} — score ${overall}%`,
        payload: { submission_id: submissionId, overall_score: overall },
      }));
      await admin.from('checklist_notifications').insert(rows);
    }

    // Audit
    await admin.from('checklist_activity_logs').insert({
      merchant_id: submission.merchant_id,
      actor_id: submission.staff_user_id,
      entity_type: 'submission',
      entity_id: submissionId,
      action: 'ai_verified',
      meta: { overall_score: overall, result },
    });

    return new Response(JSON.stringify({ success: true, result, overall_score: overall, categories, reason }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('verify-checklist-submission error', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
