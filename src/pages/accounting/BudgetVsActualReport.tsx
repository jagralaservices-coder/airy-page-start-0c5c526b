import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Download, Printer, AlertTriangle } from 'lucide-react';

interface Row {
  account_id: string; account_name: string; account_type: string;
  cost_center_id: string | null; center_name: string;
  fiscal_year: number; period_month: number | null;
  budget: number; actual: number; variance: number; utilization: number;
  alert: boolean; threshold: number;
}

export default function BudgetVsActualReport() {
  const { merchantId } = useAccountingContext();
  const [fy, setFy] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const [{ data: budgets }, { data: accounts }, { data: centers }] = await Promise.all([
        supabase.from('budgets').select('*').eq('merchant_id', merchantId).eq('fiscal_year', fy),
        supabase.from('chart_of_accounts').select('id,code,name,account_type').eq('merchant_id', merchantId),
        supabase.from('cost_centers').select('id,name').eq('merchant_id', merchantId),
      ]);
      const aMap = new Map((accounts ?? []).map((a: any) => [a.id, a]));
      const cMap = new Map((centers ?? []).map((c: any) => [c.id, c.name]));

      const start = `${fy}-04-01`;
      const end = `${fy + 1}-03-31`;
      const { data: lines } = await supabase.from('journal_lines')
        .select('account_id,cost_center_id,debit,credit,journal_entries!inner(entry_date,status,merchant_id)')
        .eq('journal_entries.merchant_id', merchantId)
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.entry_date', start)
        .lte('journal_entries.entry_date', end);

      const actualMap = new Map<string, number>();
      (lines ?? []).forEach((l: any) => {
        const acc = aMap.get(l.account_id) as any;
        if (!acc) return;
        const key = `${l.account_id}|${l.cost_center_id ?? ''}`;
        const sign = acc.account_type === 'income' ? -1 : 1;
        const val = (Number(l.debit) - Number(l.credit)) * sign;
        actualMap.set(key, (actualMap.get(key) ?? 0) + val);
        const anyKey = `${l.account_id}|`;
        actualMap.set(anyKey, (actualMap.get(anyKey) ?? 0) + val);
      });

      const list: Row[] = (budgets ?? []).map((b: any) => {
        const acc = aMap.get(b.account_id) as any;
        const key = `${b.account_id}|${b.cost_center_id ?? ''}`;
        const actual = actualMap.get(key) ?? 0;
        const budget = Number(b.budget_amount);
        const variance = actual - budget;
        const utilization = budget > 0 ? (actual / budget) * 100 : 0;
        const threshold = b.alert_threshold_pct ?? 80;
        return {
          account_id: b.account_id, account_name: acc ? `${acc.code} ${acc.name}` : '—', account_type: acc?.account_type ?? '',
          cost_center_id: b.cost_center_id, center_name: cMap.get(b.cost_center_id) ?? '—',
          fiscal_year: b.fiscal_year, period_month: b.period_month,
          budget, actual, variance, utilization,
          threshold, alert: utilization >= threshold,
        };
      });
      setRows(list);
    })();
  }, [merchantId, fy]);

  const totals = useMemo(() => rows.reduce((a, r) => ({ b: a.b + r.budget, a: a.a + r.actual }), { b: 0, a: 0 }), [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Budget vs Actual</h1>
          <p className="text-sm text-muted-foreground">Variance analysis and budget utilization alerts</p>
        </div>
        <div className="flex gap-2">
          <div><Label className="text-xs">FY</Label><Input type="number" value={fy} onChange={(e) => setFy(Number(e.target.value))} className="w-28" /></div>
          <Button variant="outline" size="sm" onClick={() => exportCSV('budget-vs-actual', rows)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Budgeted</div><div className="text-lg font-semibold font-mono">{inr(totals.b)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Actual</div><div className="text-lg font-semibold font-mono">{inr(totals.a)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Variance</div><div className={`text-lg font-semibold font-mono ${totals.a - totals.b > 0 ? 'text-destructive' : 'text-green-600'}`}>{inr(totals.a - totals.b)}</div></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Line-item Variance ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Account</th><th className="p-2">Cost Center</th><th className="p-2">Period</th>
              <th className="p-2 text-right">Budget</th><th className="p-2 text-right">Actual</th>
              <th className="p-2 text-right">Variance</th><th className="p-2 w-40">Utilization</th>
              <th className="p-2 pr-4"></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No budgets for FY {fy}</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 pl-4 text-xs">{r.account_name}</td>
                  <td className="p-2 text-xs">{r.center_name}</td>
                  <td className="p-2">{r.period_month ?? 'FY'}</td>
                  <td className="p-2 text-right font-mono">{inr(r.budget)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.actual)}</td>
                  <td className={`p-2 text-right font-mono ${r.variance > 0 ? 'text-destructive' : 'text-green-600'}`}>{inr(r.variance)}</td>
                  <td className="p-2"><div className="flex items-center gap-2"><Progress value={Math.min(100, r.utilization)} className="h-2 flex-1" /><span className="text-xs w-10 text-right">{r.utilization.toFixed(0)}%</span></div></td>
                  <td className="p-2 pr-4">{r.alert && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Alert</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
