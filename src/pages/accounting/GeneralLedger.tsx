import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';

interface Line {
  entry_id: string;
  debit: number;
  credit: number;
  description: string | null;
  journal_entries: { entry_no: string; entry_date: string; narration: string | null; source_type: string };
}

export default function GeneralLedger() {
  const { merchantId } = useAccountingContext();
  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string; account_type: string }>>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([]);
  const [opening, setOpening] = useState(0);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const { data } = await supabase.from('chart_of_accounts')
        .select('id, code, name, account_type').eq('merchant_id', merchantId).eq('is_active', true).order('code');
      setAccounts((data ?? []) as any);
      if (!accountId && data && data.length) setAccountId(data[0].id);
    })();
  }, [merchantId]);

  useEffect(() => {
    if (!accountId || !merchantId) return;
    (async () => {
      const { data: op } = await supabase.from('journal_lines')
        .select('debit,credit,journal_entries!inner(entry_date,status)')
        .eq('merchant_id', merchantId).eq('account_id', accountId)
        .lt('journal_entries.entry_date', from)
        .eq('journal_entries.status', 'posted');
      const openingBal = (op ?? []).reduce((s: number, r: any) => s + Number(r.debit) - Number(r.credit), 0);
      setOpening(openingBal);

      const { data } = await supabase.from('journal_lines')
        .select('entry_id,debit,credit,description,journal_entries!inner(entry_no,entry_date,narration,source_type,status)')
        .eq('merchant_id', merchantId).eq('account_id', accountId)
        .gte('journal_entries.entry_date', from).lte('journal_entries.entry_date', to)
        .eq('journal_entries.status', 'posted')
        .order('journal_entries(entry_date)', { ascending: true });
      setLines((data ?? []) as any);
    })();
  }, [accountId, merchantId, from, to]);

  const rows = useMemo(() => {
    let bal = opening;
    return lines.map((l) => {
      bal += Number(l.debit) - Number(l.credit);
      return { ...l, running: bal };
    });
  }, [lines, opening]);
  const totalD = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit), 0);
  const closing = opening + totalD - totalC;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">General Ledger</h1>
        <p className="text-sm text-muted-foreground">Account-wise transactions with running balance</p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-72">
          <Label className="text-xs">Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ledger</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 pl-4">Date</th>
                  <th className="p-2">Entry #</th>
                  <th className="p-2">Description</th>
                  <th className="p-2 text-right">Debit</th>
                  <th className="p-2 text-right">Credit</th>
                  <th className="p-2 text-right pr-4">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t bg-muted/20 font-medium">
                  <td className="p-2 pl-4" colSpan={5}>Opening Balance</td>
                  <td className="p-2 text-right pr-4 font-mono">₹{opening.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                </tr>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 pl-4">{r.journal_entries.entry_date}</td>
                    <td className="p-2 font-mono text-xs">{r.journal_entries.entry_no}</td>
                    <td className="p-2">{r.description || r.journal_entries.narration || r.journal_entries.source_type}</td>
                    <td className="p-2 text-right font-mono">{Number(r.debit) ? `₹${Number(r.debit).toLocaleString('en-IN')}` : ''}</td>
                    <td className="p-2 text-right font-mono">{Number(r.credit) ? `₹${Number(r.credit).toLocaleString('en-IN')}` : ''}</td>
                    <td className="p-2 text-right pr-4 font-mono">₹{r.running.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="p-2 pl-4" colSpan={3}>Closing Balance</td>
                  <td className="p-2 text-right font-mono">₹{totalD.toLocaleString('en-IN')}</td>
                  <td className="p-2 text-right font-mono">₹{totalC.toLocaleString('en-IN')}</td>
                  <td className="p-2 text-right pr-4 font-mono">₹{closing.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
