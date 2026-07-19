// Accounting: Post a balanced double-entry journal
// Idempotent by (merchant_id, idempotency_key)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface JournalLine {
  account_code?: string;
  account_id?: string;
  debit?: number;
  credit?: number;
  description?: string;
  party_type?: string;
  party_id?: string;
  cost_center_id?: string;
  tax_code?: string;
  metadata?: Record<string, unknown>;
}

interface PostJournalBody {
  merchant_id?: string;
  store_id?: string | null;
  entry_date?: string;
  source_type: string;
  source_id?: string | null;
  idempotency_key: string;
  narration?: string;
  status?: 'draft' | 'pending_approval' | 'posted';
  lines: JournalLine[];
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json(401, { error: 'unauthorized' });

    const body: PostJournalBody = await req.json();
    if (!body?.idempotency_key) return json(400, { error: 'idempotency_key required' });
    if (!body?.source_type) return json(400, { error: 'source_type required' });
    if (!Array.isArray(body?.lines) || body.lines.length < 2)
      return json(400, { error: 'at least 2 lines required' });

    // Resolve merchant_id from user role if not provided
    let merchantId = body.merchant_id;
    if (!merchantId) {
      const { data: roles } = await admin
        .from('user_roles')
        .select('merchant_id, role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('merchant_id', 'is', null);
      merchantId = roles?.[0]?.merchant_id ?? undefined;
    }
    if (!merchantId) return json(400, { error: 'merchant_id required' });

    // Idempotency check
    const { data: existing } = await admin
      .from('journal_entries')
      .select('id, entry_no, status')
      .eq('merchant_id', merchantId)
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle();
    if (existing) return json(200, { ok: true, id: existing.id, entry_no: existing.entry_no, deduped: true });

    // Resolve account_ids by code if needed
    const codes = body.lines.map((l) => l.account_code).filter(Boolean) as string[];
    let codeMap: Record<string, string> = {};
    if (codes.length) {
      const { data: accts } = await admin
        .from('chart_of_accounts')
        .select('id, code')
        .eq('merchant_id', merchantId)
        .in('code', codes);
      codeMap = Object.fromEntries((accts ?? []).map((a: any) => [a.code, a.id]));
    }

    // Build lines and validate balance
    let totalD = 0, totalC = 0;
    const lines = body.lines.map((l, idx) => {
      const account_id = l.account_id || (l.account_code ? codeMap[l.account_code] : null);
      if (!account_id) throw new Error(`account not found: ${l.account_code || '(no id)'}`);
      const debit = Number(l.debit || 0);
      const credit = Number(l.credit || 0);
      if (debit < 0 || credit < 0) throw new Error('negative amounts not allowed');
      if (debit > 0 && credit > 0) throw new Error('line cannot have both debit and credit');
      totalD += debit; totalC += credit;
      return {
        account_id,
        merchant_id: merchantId,
        store_id: body.store_id ?? null,
        debit, credit,
        line_no: idx + 1,
        description: l.description ?? null,
        party_type: l.party_type ?? null,
        party_id: l.party_id ?? null,
        cost_center_id: l.cost_center_id ?? null,
        tax_code: l.tax_code ?? null,
        metadata: l.metadata ?? {},
      };
    });
    const round = (n: number) => Math.round(n * 100) / 100;
    if (round(totalD) !== round(totalC)) {
      return json(400, { error: 'unbalanced', total_debit: totalD, total_credit: totalC });
    }

    const entry_no = `JV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`;

    const { data: entry, error: eErr } = await admin
      .from('journal_entries')
      .insert({
        merchant_id: merchantId,
        store_id: body.store_id ?? null,
        entry_no,
        entry_date: body.entry_date || new Date().toISOString().slice(0, 10),
        source_type: body.source_type,
        source_id: body.source_id ?? null,
        idempotency_key: body.idempotency_key,
        narration: body.narration ?? null,
        status: body.status || 'posted',
        total_debit: round(totalD),
        total_credit: round(totalC),
        created_by: user.id,
      })
      .select('id, entry_no')
      .single();
    if (eErr || !entry) {
      console.error('[accounting-post-journal] entry insert failed', eErr);
      return json(500, { error: eErr?.message || 'entry insert failed' });
    }

    const linesWithEntry = lines.map((l) => ({ ...l, entry_id: entry.id }));
    const { error: lErr } = await admin.from('journal_lines').insert(linesWithEntry);
    if (lErr) {
      await admin.from('journal_entries').delete().eq('id', entry.id);
      console.error('[accounting-post-journal] lines insert failed', lErr);
      return json(500, { error: lErr.message });
    }

    return json(200, { ok: true, id: entry.id, entry_no: entry.entry_no });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[accounting-post-journal] error', message);
    return json(500, { error: message });
  }
});
