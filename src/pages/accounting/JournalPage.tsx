import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { postJournal, ensureCoaSeeded, JournalLineInput } from '@/lib/accounting/postingEngine';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

interface Entry {
  id: string;
  entry_no: string;
  entry_date: string;
  source_type: string;
  narration: string | null;
  status: string;
  total_debit: number;
  total_credit: number;
}

export default function JournalPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState('');
  const [open, setOpen] = useState(false);
  const [narration, setNarration] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Array<JournalLineInput & { key: number }>>([
    { key: 1, account_code: '', debit: 0, credit: 0, description: '' },
    { key: 2, account_code: '', debit: 0, credit: 0, description: '' },
  ]);
  const [accountsList, setAccountsList] = useState<Array<{ code: string; name: string }>>([]);

  const load = React.useCallback(async () => {
    if (!merchantId) return;
    await ensureCoaSeeded(merchantId);
    let query = supabase.from('journal_entries')
      .select('id, entry_no, entry_date, source_type, narration, status, total_debit, total_credit')
      .eq('merchant_id', merchantId)
      .gte('entry_date', from).lte('entry_date', to)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (source) query = query.eq('source_type', source);
    const { data } = await query;
    setEntries((data ?? []) as any);
    const { data: accts } = await supabase.from('chart_of_accounts')
      .select('code,name').eq('merchant_id', merchantId).eq('is_active', true).order('code');
    setAccountsList((accts ?? []) as any);
  }, [merchantId, from, to, source]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const c = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    return { d, c, diff: Math.round((d - c) * 100) / 100 };
  }, [lines]);

  const submit = async () => {
    if (totals.diff !== 0) return toast.error('Debit must equal Credit');
    if (lines.some((l) => !l.account_code)) return toast.error('Pick account on each line');
    const res = await postJournal({
      merchantId: merchantId!,
      storeId,
      entryDate,
      sourceType: 'manual',
      idempotencyKey: `manual:${crypto.randomUUID()}`,
      narration,
      lines: lines.map(({ key, ...l }) => l),
    });
    if (!res.ok) return toast.error(res.error || 'Post failed');
    toast.success(`Posted ${res.entry_no}`);
    setOpen(false);
    setLines([
      { key: 1, account_code: '', debit: 0, credit: 0, description: '' },
      { key: 2, account_code: '', debit: 0, credit: 0, description: '' },
    ]);
    setNarration('');
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Journal</h1>
          <p className="text-sm text-muted-foreground">{entries.length} entries in range</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New Journal Entry</Button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">Source</Label><Input placeholder="e.g. sale, manual" value={source} onChange={(e) => setSource(e.target.value)} className="w-44" /></div>
        <Button variant="outline" onClick={load}>Apply</Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Entries</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 pl-4">Date</th>
                  <th className="p-2">Entry #</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Narration</th>
                  <th className="p-2 text-right">Debit</th>
                  <th className="p-2 text-right pr-4">Credit</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-accent/30">
                    <td className="p-2 pl-4">{e.entry_date}</td>
                    <td className="p-2 font-mono text-xs">{e.entry_no}</td>
                    <td className="p-2 capitalize">{e.source_type}</td>
                    <td className="p-2 truncate max-w-[300px]">{e.narration || '—'}</td>
                    <td className="p-2 text-right font-mono">₹{Number(e.total_debit).toLocaleString('en-IN')}</td>
                    <td className="p-2 text-right pr-4 font-mono">₹{Number(e.total_credit).toLocaleString('en-IN')}</td>
                    <td className="p-2"><Badge variant={e.status === 'posted' ? 'default' : 'secondary'} className="text-[10px] capitalize">{e.status}</Badge></td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No entries</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Journal Entry</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
            <div><Label>Narration</Label><Input value={narration} onChange={(e) => setNarration(e.target.value)} /></div>
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2">Account</th>
                  <th className="p-2">Description</th>
                  <th className="p-2 w-28 text-right">Debit</th>
                  <th className="p-2 w-28 text-right">Credit</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={l.key} className="border-t">
                    <td className="p-1">
                      <Input list="acct-list" value={l.account_code || ''} placeholder="Code"
                        onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, account_code: e.target.value } : x))} />
                    </td>
                    <td className="p-1"><Input value={l.description || ''} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} /></td>
                    <td className="p-1"><Input type="number" step="0.01" value={l.debit || 0} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, debit: Number(e.target.value), credit: 0 } : x))} className="text-right" /></td>
                    <td className="p-1"><Input type="number" step="0.01" value={l.credit || 0} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, credit: Number(e.target.value), debit: 0 } : x))} className="text-right" /></td>
                    <td className="p-1 text-center">
                      <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== idx))} disabled={lines.length <= 2}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30 font-medium">
                  <td colSpan={2} className="p-2 text-right">Totals</td>
                  <td className="p-2 text-right font-mono">₹{totals.d.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono">₹{totals.c.toFixed(2)}</td>
                  <td></td>
                </tr>
                {totals.diff !== 0 && (
                  <tr><td colSpan={5} className="p-2 text-center text-rose-600 text-xs">Difference: ₹{totals.diff.toFixed(2)}</td></tr>
                )}
              </tbody>
            </table>
            <datalist id="acct-list">
              {accountsList.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </datalist>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { key: Date.now(), account_code: '', debit: 0, credit: 0, description: '' }])}>+ Add Line</Button>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={totals.diff !== 0 || totals.d === 0}>Post Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
