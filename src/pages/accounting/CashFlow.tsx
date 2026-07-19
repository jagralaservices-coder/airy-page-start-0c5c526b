import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';

export default function CashFlow() {
  const { merchantId } = useAccountingContext();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [totals, setTotals] = useState({ opening: 0, operating: 0, investing: 0, financing: 0, closing: 0 });

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      // Opening = cash+bank balance before "from"
      const { data: op } = await supabase.from('journal_lines')
        .select('debit,credit,chart_of_accounts!inner(subtype),journal_entries!inner(entry_date,status,merchant_id)')
        .eq('merchant_id', merchantId).eq('journal_entries.status', 'posted')
        .lt('journal_entries.entry_date', from)
        .in('chart_of_accounts.subtype', ['cash', 'bank']);
      const opening = (op ?? []).reduce((s: number, r: any) => s + Number(r.debit) - Number(r.credit), 0);

      // Movements in cash/bank in period, categorized by counterpart type
      const { data: entries } = await supabase.from('journal_entries')
        .select('id, entry_date, source_type, journal_lines(debit,credit,chart_of_accounts(account_type,subtype))')
        .eq('merchant_id', merchantId).eq('status', 'posted')
        .gte('entry_date', from).lte('entry_date', to);

      let operating = 0, investing = 0, financing = 0;
      for (const e of (entries ?? []) as any[]) {
        const ls = e.journal_lines || [];
        const cashDelta = ls
          .filter((l: any) => ['cash', 'bank'].includes(l.chart_of_accounts?.subtype))
          .reduce((s: number, l: any) => s + Number(l.debit) - Number(l.credit), 0);
        if (cashDelta === 0) continue;
        const hasFixedAsset = ls.some((l: any) => l.chart_of_accounts?.subtype === 'fixed_asset');
        const hasEquityOrLoan = ls.some((l: any) => l.chart_of_accounts?.account_type === 'equity' || l.chart_of_accounts?.subtype === 'long_term');
        if (hasFixedAsset) investing += cashDelta;
        else if (hasEquityOrLoan) financing += cashDelta;
        else operating += cashDelta;
      }
      const closing = opening + operating + investing + financing;
      setTotals({ opening, operating, investing, financing, closing });
    })();
  }, [merchantId, from, to]);

  const row = (label: string, v: number, bold?: boolean) => (
    <tr className={bold ? 'border-t bg-muted/40 font-semibold' : 'border-t'}>
      <td className="p-2 pl-4">{label}</td>
      <td className="p-2 text-right pr-4 font-mono">₹{v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
    </tr>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cash Flow Statement</h1>
          <p className="text-sm text-muted-foreground">{from} to {to}</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Cash Flow</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {row('Opening Cash & Bank', totals.opening, true)}
              {row('Operating Activities', totals.operating)}
              {row('Investing Activities', totals.investing)}
              {row('Financing Activities', totals.financing)}
              {row('Net Change', totals.operating + totals.investing + totals.financing, true)}
              {row('Closing Cash & Bank', totals.closing, true)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
