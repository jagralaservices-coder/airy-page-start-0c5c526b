import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { ensureCoaSeeded } from '@/lib/accounting/postingEngine';
import { TrendingUp, TrendingDown, Wallet, Landmark, Users, Building, PiggyBank, Receipt } from 'lucide-react';

interface Totals {
  revenueToday: number;
  expensesToday: number;
  cash: number;
  bank: number;
  ar: number;
  ap: number;
  profitToday: number;
  profitMonth: number;
  taxPayable: number;
  taxReceivable: number;
}

const INR = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function AccountingDashboard() {
  const { merchantId, storeId, loading } = useAccountingContext();
  const [t, setT] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    if (!merchantId) return;
    setBusy(true);
    await ensureCoaSeeded(merchantId);

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';

    // Pull lines joined with account type
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('debit,credit,account_id,entry_id,store_id,chart_of_accounts!inner(account_type,subtype,code),journal_entries!inner(entry_date,merchant_id,status)')
      .eq('merchant_id', merchantId)
      .eq('journal_entries.status', 'posted');

    const rows = (lines ?? []) as any[];
    const filtered = storeId ? rows.filter((r) => !r.store_id || r.store_id === storeId) : rows;

    const totals: Totals = {
      revenueToday: 0, expensesToday: 0, cash: 0, bank: 0, ar: 0, ap: 0,
      profitToday: 0, profitMonth: 0, taxPayable: 0, taxReceivable: 0,
    };
    for (const r of filtered) {
      const type = r.chart_of_accounts?.account_type;
      const sub = r.chart_of_accounts?.subtype;
      const code = r.chart_of_accounts?.code;
      const date = r.journal_entries?.entry_date;
      const d = Number(r.debit || 0);
      const c = Number(r.credit || 0);
      const net = c - d; // income/liab natural
      if (sub === 'cash') totals.cash += d - c;
      if (sub === 'bank') totals.bank += d - c;
      if (sub === 'receivable') totals.ar += d - c;
      if (sub === 'payable') totals.ap += c - d;
      if (sub === 'tax_payable') totals.taxPayable += c - d;
      if (sub === 'tax_receivable') totals.taxReceivable += d - c;
      if (type === 'income') {
        if (date === today) totals.revenueToday += net;
        if (date >= monthStart) totals.profitMonth += net;
        totals.profitToday += date === today ? net : 0;
      }
      if (type === 'expense') {
        const spent = d - c;
        if (date === today) totals.expensesToday += spent;
        if (date >= monthStart) totals.profitMonth -= spent;
        totals.profitToday -= date === today ? spent : 0;
      }
    }
    setT(totals);
    setBusy(false);
  }, [merchantId, storeId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !merchantId) return <div className="p-6 text-sm text-muted-foreground">Loading accounting…</div>;

  const cards = [
    { label: "Today's Revenue", value: INR(t?.revenueToday ?? 0), icon: TrendingUp, tone: 'text-emerald-600' },
    { label: "Today's Expenses", value: INR(t?.expensesToday ?? 0), icon: TrendingDown, tone: 'text-rose-600' },
    { label: "Today's Profit", value: INR(t?.profitToday ?? 0), icon: PiggyBank, tone: 'text-primary' },
    { label: 'Monthly Profit', value: INR(t?.profitMonth ?? 0), icon: PiggyBank, tone: 'text-primary' },
    { label: 'Cash Balance', value: INR(t?.cash ?? 0), icon: Wallet, tone: 'text-amber-600' },
    { label: 'Bank Balance', value: INR(t?.bank ?? 0), icon: Landmark, tone: 'text-blue-600' },
    { label: 'Receivables (AR)', value: INR(t?.ar ?? 0), icon: Users, tone: 'text-cyan-600' },
    { label: 'Payables (AP)', value: INR(t?.ap ?? 0), icon: Building, tone: 'text-orange-600' },
    { label: 'Tax Payable', value: INR(t?.taxPayable ?? 0), icon: Receipt, tone: 'text-rose-600' },
    { label: 'Tax Receivable', value: INR(t?.taxReceivable ?? 0), icon: Receipt, tone: 'text-emerald-600' },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounting Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time double-entry books</p>
        </div>
        <Button onClick={load} disabled={busy} variant="outline">Refresh</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.tone}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
