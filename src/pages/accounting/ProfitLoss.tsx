import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';

interface Agg { code: string; name: string; subtype: string | null; net: number; }

async function fetchByType(merchantId: string, type: string, from: string | null, to: string) {
  let q = supabase.from('journal_lines')
    .select('debit,credit,chart_of_accounts!inner(code,name,subtype,account_type),journal_entries!inner(entry_date,status,merchant_id)')
    .eq('merchant_id', merchantId)
    .eq('journal_entries.status', 'posted')
    .eq('chart_of_accounts.account_type', type)
    .lte('journal_entries.entry_date', to);
  if (from) q = q.gte('journal_entries.entry_date', from);
  const { data } = await q;
  const map = new Map<string, Agg>();
  for (const r of (data ?? []) as any[]) {
    const a = r.chart_of_accounts;
    const cur = map.get(a.code) || { code: a.code, name: a.name, subtype: a.subtype, net: 0 };
    cur.net += (type === 'income') ? Number(r.credit) - Number(r.debit) : Number(r.debit) - Number(r.credit);
    map.set(a.code, cur);
  }
  return Array.from(map.values()).filter((x) => x.net !== 0).sort((a, b) => a.code.localeCompare(b.code));
}

export default function ProfitLoss() {
  const { merchantId } = useAccountingContext();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [income, setIncome] = useState<Agg[]>([]);
  const [expense, setExpense] = useState<Agg[]>([]);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      setIncome(await fetchByType(merchantId, 'income', from, to));
      setExpense(await fetchByType(merchantId, 'expense', from, to));
    })();
  }, [merchantId, from, to]);

  const totalRev = income.reduce((s, x) => s + x.net, 0);
  const cogs = expense.filter((x) => x.subtype === 'cogs').reduce((s, x) => s + x.net, 0);
  const opex = expense.filter((x) => x.subtype !== 'cogs').reduce((s, x) => s + x.net, 0);
  const grossProfit = totalRev - cogs;
  const netProfit = grossProfit - opex;

  const Section = ({ title, rows, total }: { title: string; rows: Agg[]; total: number }) => (
    <div>
      <div className="font-semibold text-sm mb-1">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t">
              <td className="p-2 pl-4 font-mono text-xs w-24">{r.code}</td>
              <td className="p-2">{r.name}</td>
              <td className="p-2 text-right pr-4 font-mono">₹{r.net.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
            </tr>
          ))}
          <tr className="border-t bg-muted/40 font-semibold">
            <td className="p-2 pl-4" colSpan={2}>Total {title}</td>
            <td className="p-2 text-right pr-4 font-mono">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Profit &amp; Loss</h1>
          <p className="text-sm text-muted-foreground">{from} to {to}</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
        </div>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Revenue</CardTitle></CardHeader><CardContent className="p-0 pb-2"><Section title="Revenue" rows={income} total={totalRev} /></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Cost of Goods Sold</CardTitle></CardHeader><CardContent className="p-0 pb-2"><Section title="COGS" rows={expense.filter(x => x.subtype === 'cogs')} total={cogs} /></CardContent></Card>
      <Card><CardContent className="p-4 flex justify-between font-semibold"><span>Gross Profit</span><span className="font-mono">₹{grossProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Operating Expenses</CardTitle></CardHeader><CardContent className="p-0 pb-2"><Section title="Expenses" rows={expense.filter(x => x.subtype !== 'cogs')} total={opex} /></CardContent></Card>
      <Card><CardContent className="p-4 flex justify-between text-lg font-bold border-primary"><span>Net Profit</span><span className={`font-mono ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>₹{netProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></CardContent></Card>
    </div>
  );
}
