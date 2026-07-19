import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';

interface Row { code: string; name: string; type: string; subtype: string | null; bal: number; }

export default function BalanceSheet() {
  const { merchantId } = useAccountingContext();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [ytdProfit, setYtdProfit] = useState(0);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const { data } = await supabase.from('journal_lines')
        .select('debit,credit,chart_of_accounts!inner(code,name,account_type,subtype),journal_entries!inner(entry_date,status,merchant_id)')
        .eq('merchant_id', merchantId)
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.entry_date', asOf);
      const map = new Map<string, Row>();
      let ytdIncome = 0, ytdExpense = 0;
      for (const r of (data ?? []) as any[]) {
        const a = r.chart_of_accounts;
        const t = a.account_type;
        const cur = map.get(a.code) || { code: a.code, name: a.name, type: t, subtype: a.subtype, bal: 0 };
        const debitMinusCredit = Number(r.debit) - Number(r.credit);
        cur.bal += debitMinusCredit;
        map.set(a.code, cur);
        if (t === 'income') ytdIncome += -debitMinusCredit;
        if (t === 'expense') ytdExpense += debitMinusCredit;
      }
      setRows(Array.from(map.values()));
      setYtdProfit(ytdIncome - ytdExpense);
    })();
  }, [merchantId, asOf]);

  // Assets: debit-normal (bal > 0 credits Fixed Asset contra reduces)
  const assets = rows.filter((r) => r.type === 'asset').map((r) => ({ ...r, show: r.bal }));
  const liabilities = rows.filter((r) => r.type === 'liability').map((r) => ({ ...r, show: -r.bal }));
  const equity = rows.filter((r) => r.type === 'equity').map((r) => ({ ...r, show: -r.bal }));
  const totalAssets = assets.reduce((s, r) => s + r.show, 0);
  const totalLiab = liabilities.reduce((s, r) => s + r.show, 0);
  const totalEquity = equity.reduce((s, r) => s + r.show, 0) + ytdProfit;

  const Section = ({ title, list, total }: { title: string; list: Array<Row & { show: number }>; total: number }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0 pb-2">
        <table className="w-full text-sm">
          <tbody>
            {list.filter((r) => Math.abs(r.show) > 0.001).map((r) => (
              <tr key={r.code} className="border-t">
                <td className="p-2 pl-4 font-mono text-xs w-24">{r.code}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right pr-4 font-mono">₹{r.show.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {title === 'Equity' && (
              <tr className="border-t">
                <td className="p-2 pl-4 font-mono text-xs w-24">P&amp;L</td>
                <td className="p-2">Current Period Earnings</td>
                <td className="p-2 text-right pr-4 font-mono">₹{ytdProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
              </tr>
            )}
            <tr className="border-t bg-muted/40 font-semibold">
              <td className="p-2 pl-4" colSpan={2}>Total {title}</td>
              <td className="p-2 text-right pr-4 font-mono">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Balance Sheet</h1>
          <p className="text-sm text-muted-foreground">As of {asOf}</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">As of</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" /></div>
          <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Assets" list={assets as any} total={totalAssets} />
        <div className="space-y-4">
          <Section title="Liabilities" list={liabilities as any} total={totalLiab} />
          <Section title="Equity" list={equity as any} total={totalEquity} />
        </div>
      </div>
      <Card>
        <CardContent className="p-4 flex justify-between font-semibold">
          <span>Assets {totalAssets.toFixed(2)} = Liabilities + Equity {(totalLiab + totalEquity).toFixed(2)}</span>
          <span className={Math.abs(totalAssets - (totalLiab + totalEquity)) < 0.5 ? 'text-emerald-600' : 'text-rose-600'}>
            Diff ₹{(totalAssets - (totalLiab + totalEquity)).toFixed(2)}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
