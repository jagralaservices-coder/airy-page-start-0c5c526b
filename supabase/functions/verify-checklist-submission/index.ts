// Real per-item AI verification for staff checklist submissions.
// For each checklist item that requires an image:
//   - loads the owner's reference image(s) for that item
//   - loads the staff's uploaded image(s) for that item
//   - asks Gemini 2.5 Pro to compare and return a strict JSON verdict
// Never fabricates scores. If no reference image exists, returns
// status='no_reference' for that item. If image quality is poor, returns
// status='poor_quality'. Submission status is derived from real per-item outcomes.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const AI_MODEL = 'google/gemini-2.5-pro';

const SYSTEM_PROMPT = `You are a strict visual compliance auditor. You will be given:
1. One or more REFERENCE images (the required standard, uploaded by the business owner for this specific checklist item).
2. One or more SUBMITTED images (uploaded by a staff member for this specific item).
3. A checklist item label and optional description describing exactly WHAT to verify.

You must ONLY judge the specific item described. Do NOT invent categories, do NOT score anything the item does not mention (e.g. do not comment on uniform if the item is "kitchen floor"), and do NOT produce any generic grooming report.

FIRST, evaluate submitted image quality:
- If any submitted image is too dark, over-exposed, blurred, or too low resolution to judge → return status="poor_quality" with an explicit reason. Do NOT continue.

THEN compare the submitted image(s) with the reference image(s) strictly for the described item and describe what you actually see vs the reference.

Return ONLY this JSON (no prose, no markdown fence):
{
  "status": "match" | "no_match" | "poor_quality",
  "confidence": <integer 0-100 based on ACTUAL visual evidence>,
  "reason": "one short sentence citing concrete evidence for THIS item",
  "detected_problems": ["short problem", "..."],
  "missing_objects": ["..."],
  "suggestions": "short, actionable"
}

Rules:
- Confidence must reflect how sure you are of the verdict based on what you actually see. Do NOT default to 70 or any placeholder. If you cannot see enough, return status="poor_quality".
- Do NOT invent objects that are not visible.
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

async function verifyItem(opts: {
  itemTitle: string;
  itemDescription?: string | null;
  referenceB64: Array<{ mime: string; data: string }>;
  submittedB64: Array<{ mime: string; data: string }>;
}): Promise<{ status: string; confidence: number | null; reason: string; detected_problems?: any; suggestions?: string; raw: any }> {
  const content: any[] = [
    { type: 'text', text: `Checklist item: "${opts.itemTitle}"${opts.itemDescription ? ` — ${opts.itemDescription}` : ''}` },
    { type: 'text', text: `Reference images (${opts.referenceB64.length}):` },
    ...opts.referenceB64.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })),
    { type: 'text', text: `Submitted images (${opts.submittedB64.length}):` },
    ...opts.submittedB64.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })),
    { type: 'text', text: 'Return the JSON verdict only.' },
  ];

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': LOVABLE_API_KEY },
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
    const t = await aiRes.text();
    const err: any = new Error(`AI ${aiRes.status}: ${t.slice(0, 200)}`);
    err.status = aiRes.status;
    throw err;
  }

  const aiJson = await aiRes.json();
  const raw = aiJson?.choices?.[0]?.message?.content ?? '{}';
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'error', confidence: null, reason: 'AI returned invalid JSON', raw: { raw } };
  }

  const status = ['match', 'no_match', 'poor_quality'].includes(parsed.status) ? parsed.status : 'error';
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
    : null;
  return {
    status,
    confidence,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    detected_problems: parsed.detected_problems ?? null,
    suggestions: typeof parsed.suggestions === 'string' ? parsed.suggestions : undefined,
    raw: parsed,
  };
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

    // Load checklist items that require image AND have AI verification explicitly enabled.
    // AI is dynamic: it only runs on items the owner opted in.
    const { data: items } = await admin
      .from('checklist_items')
      .select('id, title, description, input_type, ai_verify')
      .eq('checklist_id', submission.checklist_id);

    const imageItems = (items ?? []).filter((it: any) =>
      (it.input_type === 'image' || it.input_type === 'tick_image') && it.ai_verify === true
    );

    // Load submitted images grouped by item
    const { data: subImgs } = await admin
      .from('submission_images')
      .select('id, storage_path, kind, item_id')
      .eq('submission_id', submissionId);

    const submittedByItem = new Map<string, any[]>();
    for (const s of (subImgs ?? [])) {
      if (!s.item_id) continue;
      const arr = submittedByItem.get(s.item_id) ?? [];
      arr.push(s);
      submittedByItem.set(s.item_id, arr);
    }

    // Load reference images grouped by item
    const itemIds = imageItems.map((it: any) => it.id);
    const refByItem = new Map<string, any[]>();
    if (itemIds.length) {
      const { data: refs } = await admin
        .from('checklist_item_reference_images')
        .select('id, item_id, storage_path')
        .in('item_id', itemIds);
      for (const r of (refs ?? [])) {
        const arr = refByItem.get(r.item_id) ?? [];
        arr.push(r);
        refByItem.set(r.item_id, arr);
      }
    }

    const perItem: any[] = [];

    for (const it of imageItems) {
      const submitted = submittedByItem.get(it.id) ?? [];
      const refs = refByItem.get(it.id) ?? [];

      // Skip AI when owner hasn't configured references.
      if (!refs.length) {
        const row = {
          submission_id: submissionId, item_id: it.id,
          status: 'no_reference', confidence: null,
          reason: 'Reference image not configured by owner.',
          detected_problems: null, suggestions: null, model: null, raw_response: null,
        };
        await admin.from('ai_item_verification_results').insert(row);
        perItem.push({ item_id: it.id, title: it.title, ...row });
        continue;
      }
      if (!submitted.length) {
        const row = {
          submission_id: submissionId, item_id: it.id,
          status: 'error', confidence: null,
          reason: 'No image submitted for this item.',
          detected_problems: null, suggestions: null, model: null, raw_response: null,
        };
        await admin.from('ai_item_verification_results').insert(row);
        perItem.push({ item_id: it.id, title: it.title, ...row });
        continue;
      }

      // Load bytes for AI (cap to avoid huge payloads: first 2 ref + first 2 submitted).
      const refB64 = (await Promise.all(refs.slice(0, 2).map((r: any) => fetchAsBase64(admin, 'uniform-reference', r.storage_path))))
        .filter(Boolean) as Array<{ mime: string; data: string }>;
      const subB64 = (await Promise.all(submitted.slice(0, 2).map((s: any) => fetchAsBase64(admin, 'staff-checklist', s.storage_path))))
        .filter(Boolean) as Array<{ mime: string; data: string }>;

      if (!refB64.length || !subB64.length) {
        const row = {
          submission_id: submissionId, item_id: it.id,
          status: 'error', confidence: null,
          reason: 'Failed to load one or more images.',
          detected_problems: null, suggestions: null, model: null, raw_response: null,
        };
        await admin.from('ai_item_verification_results').insert(row);
        perItem.push({ item_id: it.id, title: it.title, ...row });
        continue;
      }

      try {
        const verdict = await verifyItem({
          itemTitle: it.title,
          itemDescription: it.description,
          referenceB64: refB64,
          submittedB64: subB64,
        });
        const row = {
          submission_id: submissionId, item_id: it.id,
          status: verdict.status, confidence: verdict.confidence,
          reason: verdict.reason,
          detected_problems: verdict.detected_problems ?? null,
          suggestions: verdict.suggestions ?? null,
          model: AI_MODEL,
          raw_response: verdict.raw,
        };
        await admin.from('ai_item_verification_results').insert(row);
        perItem.push({ item_id: it.id, title: it.title, ...row });
      } catch (e: any) {
        if (e?.status === 429) {
          return new Response(JSON.stringify({ error: 'AI rate limit reached. Please retry shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (e?.status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits to continue.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const row = {
          submission_id: submissionId, item_id: it.id,
          status: 'error', confidence: null,
          reason: e?.message ?? 'AI request failed.',
          detected_problems: null, suggestions: null, model: AI_MODEL, raw_response: null,
        };
        await admin.from('ai_item_verification_results').insert(row);
        perItem.push({ item_id: it.id, title: it.title, ...row });
      }
    }

    // Derive submission status from REAL per-item outcomes only.
    const evaluated = perItem.filter(p => p.status === 'match' || p.status === 'no_match');
    const anyNoMatch = perItem.some(p => p.status === 'no_match');
    const anyPoor = perItem.some(p => p.status === 'poor_quality');
    const anyNoRef = perItem.some(p => p.status === 'no_reference');

    let subStatus: 'ai_pass' | 'ai_fail' | 'pending' = 'pending';
    if (perItem.length === 0) {
      subStatus = 'pending'; // nothing to auto-verify
    } else if (evaluated.length === perItem.length && !anyNoMatch) {
      subStatus = 'ai_pass';
    } else if (anyNoMatch || anyPoor) {
      subStatus = 'ai_fail';
    } else if (anyNoRef) {
      subStatus = 'pending'; // needs owner setup / manual review
    }

    await admin.from('checklist_submissions').update({
      status: subStatus,
      overall_score: null, // no fake overall score
    }).eq('id', submissionId);

    // Notify owners
    const { data: owners } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('customer_id', submission.merchant_id)
      .in('role', ['owner','merchant','admin','store_manager']);
    const recipients = Array.from(new Set((owners ?? []).map((o: any) => o.user_id).filter(Boolean)));
    if (recipients.length) {
      const kind = subStatus === 'ai_pass' ? 'ai_pass' : subStatus === 'ai_fail' ? 'ai_fail' : 'submitted';
      const title = subStatus === 'ai_pass' ? 'Checklist AI-verified: match'
                  : subStatus === 'ai_fail' ? 'Checklist AI verification: issues found'
                  : 'Checklist submitted (needs review)';
      await admin.from('checklist_notifications').insert(recipients.map((uid: string) => ({
        user_id: uid, merchant_id: submission.merchant_id, kind, title,
        body: `${submission.staff_name ?? 'Staff'} — ${evaluated.length}/${perItem.length} items matched`,
        payload: { submission_id: submissionId },
      })));
    }

    await admin.from('checklist_activity_logs').insert({
      merchant_id: submission.merchant_id,
      actor_id: submission.staff_user_id,
      entity_type: 'submission',
      entity_id: submissionId,
      action: 'ai_verified',
      meta: { status: subStatus, items: perItem.length },
    });

    return new Response(JSON.stringify({
      success: true,
      submission_status: subStatus,
      items: perItem.map(p => ({
        item_id: p.item_id, title: p.title, status: p.status, confidence: p.confidence,
        reason: p.reason, detected_problems: p.detected_problems, suggestions: p.suggestions,
      })),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('verify-checklist-submission error', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
