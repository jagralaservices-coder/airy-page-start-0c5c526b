import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';

const TAX_CODES = [
  { code: '2100', label: 'Output CGST' },
  { code: '2110', label: 'Output SGST' },
  { code: '2120', label: 'Output IGST' },
  { code: '1400', label: 'Input CGST' },
  { code: '1410', label: 'Input SGST' },
  { code: '1420', label: 'Input IGST' },
];

export default function TaxPage() {
  const { merchantId } = useAccountingContext();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [totals, setTotals] = useState<Record<string, { d: number; c: number }>>({});

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const codes = TAX_CODES.map((t) => t.code);
      const { data } = await supabase.from('journal_lines')
        .select('debit,credit,chart_of_accounts!inner(code),journal_entries!inner(entry_date,status,merchant_id)')
        .eq('merchant_id', merchantId).eq('journal_entries.status', 'posted')
        .in('chart_of_accounts.code', codes)
        .gte('journal_entries.entry_date', from).lte('journal_entries.entry_date', to);
      const map: Record<string, { d: number; c: number }> = {};
      for (const r of (data ?? []) as any[]) {
        const code = r.chart_of_accounts.code;
        if (!map[code]) map[code] = { d: 0, c: 0 };
        map[code].d += Number(r.debit || 0);
        map[code].c += Number(r.credit || 0);
      }
      setTotals(map);
    })();
  }, [merchantId, from, to]);

  const outputTax = ['2100', '2110', '2120'].reduce((s, c) => s + ((totals[c]?.c || 0) - (totals[c]?.d || 0)), 0);
  const inputTax = ['1400', '1410', '1420'].reduce((s, c) => s + ((totals[c]?.d || 0) - (totals[c]?.c || 0)), 0);
  const netPayable = outputTax - inputTax;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tax / GST</h1>
          <p className="text-sm text-muted-foreground">Output vs Input GST · GSTR-ready</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Tax Register</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 pl-4">Code</th>
                <th className="p-2">Ledger</th>
                <th className="p-2 text-right">Debit</th>
                <th className="p-2 text-right">Credit</th>
                <th className="p-2 text-right pr-4">Net</th>
              </tr>
            </thead>
            <tbody>
              {TAX_CODES.map((t) => {
                const d = totals[t.code]?.d || 0;
                const c = totals[t.code]?.c || 0;
                const isOutput = t.code.startsWith('21');
                const net = isOutput ? c - d : d - c;
                return (
                  <tr key={t.code} className="border-t">
                    <td className="p-2 pl-4 font-mono text-xs">{t.code}</td>
                    <td className="p-2">{t.label}</td>
                    <td className="p-2 text-right font-mono">₹{d.toLocaleString('en-IN')}</td>
                    <td className="p-2 text-right font-mono">₹{c.toLocaleString('en-IN')}</td>
                    <td className="p-2 text-right pr-4 font-mono">₹{net.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Output Tax Collected</div><div className="text-xl font-bold">₹{outputTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Input Tax Credit</div><div className="text-xl font-bold">₹{inputTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Net GST Payable</div><div className={`text-xl font-bold ${netPayable >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>₹{netPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div></CardContent></Card>
      </div>
    </div>
  );
}
