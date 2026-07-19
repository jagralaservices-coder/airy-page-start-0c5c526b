import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Download, Printer } from 'lucide-react';

interface Row {
  cost_center_id: string; name: string;
  revenue: number; expense: number; profit: number; budget: number; variance: number; roi: number;
}

export default function CostCenterReport() {
  const { merchantId } = useAccountingContext();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), 3, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const [{ data: centers }, { data: accounts }, { data: budgets }, { data: lines }] = await Promise.all([
        supabase.from('cost_centers').select('id,name').eq('merchant_id', merchantId).eq('is_active', true),
        supabase.from('chart_of_accounts').select('id,account_type').eq('merchant_id', merchantId),
        supabase.from('budgets').select('cost_center_id,budget_amount').eq('merchant_id', merchantId),
        supabase.from('journal_lines').select('cost_center_id,account_id,debit,credit,journal_entries!inner(entry_date,status,merchant_id)')
          .eq('journal_entries.merchant_id', merchantId).eq('journal_entries.status', 'posted')
          .gte('journal_entries.entry_date', from).lte('journal_entries.entry_date', to),
      ]);
      const aMap = new Map((accounts ?? []).map((a: any) => [a.id, a.account_type]));
      const budgetMap = new Map<string, number>();
      (budgets ?? []).forEach((b: any) => { if (b.cost_center_id) budgetMap.set(b.cost_center_id, (budgetMap.get(b.cost_center_id) ?? 0) + Number(b.budget_amount)); });

      const acc = new Map<string, { r: number; e: number }>();
      (lines ?? []).forEach((l: any) => {
        if (!l.cost_center_id) return;
        const t = aMap.get(l.account_id);
        if (!t) return;
        const cur = acc.get(l.cost_center_id) ?? { r: 0, e: 0 };
        if (t === 'income') cur.r += Number(l.credit) - Number(l.debit);
        if (t === 'expense') cur.e += Number(l.debit) - Number(l.credit);
        acc.set(l.cost_center_id, cur);
      });
      const list: Row[] = (centers ?? []).map((c: any) => {
        const v = acc.get(c.id) ?? { r: 0, e: 0 };
        const budget = budgetMap.get(c.id) ?? 0;
        const profit = v.r - v.e;
        const roi = v.e > 0 ? (profit / v.e) * 100 : 0;
        return { cost_center_id: c.id, name: c.name, revenue: v.r, expense: v.e, profit, budget, variance: v.e - budget, roi };
      });
      setRows(list);
    })();
  }, [merchantId, from, to]);

  const totals = rows.reduce((a, r) => ({ r: a.r + r.revenue, e: a.e + r.expense, p: a.p + r.profit, b: a.b + r.budget }), { r: 0, e: 0, p: 0, b: 0 });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cost Center Analysis</h1>
          <p className="text-sm text-muted-foreground">Revenue, expense, profit, budget variance and ROI by cost center</p>
        </div>
        <div className="flex gap-2">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          <div className="flex gap-2 items-end">
            <Button variant="outline" size="sm" onClick={() => exportCSV('cost-center-analysis', rows)}><Download className="h-4 w-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          </div>
        </div>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Cost Centers ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Cost Center</th>
              <th className="p-2 text-right">Revenue</th>
              <th className="p-2 text-right">Expense</th>
              <th className="p-2 text-right">Profit / Loss</th>
              <th className="p-2 text-right">Budget</th>
              <th className="p-2 text-right">Variance</th>
              <th className="p-2 text-right pr-4">ROI %</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No cost center activity in range</td></tr>}
              {rows.map((r) => (
                <tr key={r.cost_center_id} className="border-t">
                  <td className="p-2 pl-4">{r.name}</td>
                  <td className="p-2 text-right font-mono">{inr(r.revenue)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.expense)}</td>
                  <td className={`p-2 text-right font-mono ${r.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>{inr(r.profit)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.budget)}</td>
                  <td className={`p-2 text-right font-mono ${r.variance <= 0 ? 'text-green-600' : 'text-destructive'}`}>{inr(r.variance)}</td>
                  <td className="p-2 text-right pr-4 font-mono">{r.roi.toFixed(1)}%</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="p-2 pl-4">Total</td>
                  <td className="p-2 text-right font-mono">{inr(totals.r)}</td>
                  <td className="p-2 text-right font-mono">{inr(totals.e)}</td>
                  <td className="p-2 text-right font-mono">{inr(totals.p)}</td>
                  <td className="p-2 text-right font-mono">{inr(totals.b)}</td>
                  <td className="p-2 text-right font-mono">{inr(totals.e - totals.b)}</td>
                  <td className="p-2 text-right pr-4"></td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
