import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';

interface Row { code: string; name: string; type: string; debit: number; credit: number; }

export default function TrialBalance() {
  const { merchantId } = useAccountingContext();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);

  const load = React.useCallback(async () => {
    if (!merchantId) return;
    const { data } = await supabase.from('journal_lines')
      .select('debit,credit,chart_of_accounts!inner(code,name,account_type),journal_entries!inner(entry_date,status,merchant_id)')
      .eq('merchant_id', merchantId)
      .eq('journal_entries.status', 'posted')
      .lte('journal_entries.entry_date', asOf);
    const map = new Map<string, Row>();
    for (const r of (data ?? []) as any[]) {
      const a = r.chart_of_accounts;
      const key = a.code;
      const cur = map.get(key) || { code: a.code, name: a.name, type: a.account_type, debit: 0, credit: 0 };
      cur.debit += Number(r.debit || 0);
      cur.credit += Number(r.credit || 0);
      map.set(key, cur);
    }
    setRows(Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code)));
  }, [merchantId, asOf]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const r of rows) {
      const bal = r.debit - r.credit;
      if (bal >= 0) d += bal; else c += -bal;
    }
    return { d, c, diff: Math.round((d - c) * 100) / 100 };
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trial Balance</h1>
          <p className="text-sm text-muted-foreground">All accounts as of {asOf}</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">As of</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" /></div>
          <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Balances</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 pl-4">Code</th>
                  <th className="p-2">Account</th>
                  <th className="p-2">Type</th>
                  <th className="p-2 text-right">Debit</th>
                  <th className="p-2 text-right pr-4">Credit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bal = r.debit - r.credit;
                  return (
                    <tr key={r.code} className="border-t">
                      <td className="p-2 pl-4 font-mono text-xs">{r.code}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 capitalize text-muted-foreground">{r.type}</td>
                      <td className="p-2 text-right font-mono">{bal > 0 ? `₹${bal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}</td>
                      <td className="p-2 text-right pr-4 font-mono">{bal < 0 ? `₹${(-bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}</td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-muted/40 font-semibold">
                  <td className="p-2 pl-4" colSpan={3}>Totals</td>
                  <td className="p-2 text-right font-mono">₹{totals.d.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right pr-4 font-mono">₹{totals.c.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                </tr>
                {totals.diff !== 0 && (
                  <tr><td colSpan={5} className="p-2 text-center text-rose-600 text-xs">Difference: ₹{totals.diff.toFixed(2)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
