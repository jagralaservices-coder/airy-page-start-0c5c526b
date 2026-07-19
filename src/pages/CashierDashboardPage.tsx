import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { usePOSSafe } from '@/contexts/POSContext';
import { Users, IndianRupee, ReceiptText, Clock } from 'lucide-react';

interface ShiftRow {
  id: string;
  cashier_id: string;
  opened_at: string;
  closed_at: string | null;
  bills_created: number;
  sales_amount: number;
  cash_collected: number;
  upi_collected: number;
  card_collected: number;
  credit_sales: number;
  cancelled_bills: number;
  device_name: string | null;
  cashier?: { name: string; cashier_code: string } | null;
}

export default function CashierDashboardPage() {
  const pos = usePOSSafe();
  const storeId = pos?.activeStore?.id || '';
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('cashier_shifts')
        .select('id,cashier_id,opened_at,closed_at,bills_created,sales_amount,cash_collected,upi_collected,card_collected,credit_sales,cancelled_bills,device_name,cashier:cashiers(name,cashier_code)')
        .eq('store_id', storeId)
        .order('opened_at', { ascending: false })
        .limit(100);
      if (mounted) {
        setShifts(((data as any[]) || []) as ShiftRow[]);
        setLoading(false);
      }
    };
    load();
    const channel = supabase
      .channel(`cashier-shifts-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashier_shifts', filter: `store_id=eq.${storeId}` }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [storeId]);

  const online = useMemo(() => shifts.filter((s) => !s.closed_at), [shifts]);
  const totals = useMemo(() => {
    const t = { sales: 0, bills: 0, cash: 0, upi: 0, card: 0, credit: 0 };
    for (const s of shifts) {
      t.sales += Number(s.sales_amount) || 0;
      t.bills += Number(s.bills_created) || 0;
      t.cash += Number(s.cash_collected) || 0;
      t.upi += Number(s.upi_collected) || 0;
      t.card += Number(s.card_collected) || 0;
      t.credit += Number(s.credit_sales) || 0;
    }
    return t;
  }, [shifts]);

  const avgBill = totals.bills ? totals.sales / totals.bills : 0;
  const fmtINR = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;

  if (!storeId) return <div className="p-6 text-muted-foreground">Select a store.</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Cashier Dashboard</h1>
        <p className="text-sm text-muted-foreground">Realtime cashier activity for {pos?.activeStore?.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Users className="h-4 w-4" />} label="Online Cashiers" value={String(online.length)} />
        <Kpi icon={<ReceiptText className="h-4 w-4" />} label="Bills (last 100 shifts)" value={String(totals.bills)} />
        <Kpi icon={<IndianRupee className="h-4 w-4" />} label="Total Sales" value={fmtINR(totals.sales)} />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Avg Bill" value={fmtINR(avgBill)} />
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-3">Online Right Now</div>
        {online.length === 0 ? (
          <div className="text-sm text-muted-foreground">No cashier is currently signed in.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {online.map((s) => (
              <Badge key={s.id} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                {s.cashier?.name || 'Cashier'} · {s.cashier?.cashier_code} · since {new Date(s.opened_at).toLocaleTimeString()}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cashier</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead className="text-right">Bills</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">UPI</TableHead>
              <TableHead className="text-right">Card</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
              <TableHead>Device</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (<TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>)}
            {!loading && shifts.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No shifts yet.</TableCell></TableRow>
            )}
            {shifts.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.cashier?.name || '—'} <span className="text-xs text-muted-foreground font-mono">{s.cashier?.cashier_code}</span></TableCell>
                <TableCell className="text-xs">{new Date(s.opened_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{s.closed_at ? new Date(s.closed_at).toLocaleString() : <Badge variant="secondary">Open</Badge>}</TableCell>
                <TableCell className="text-right">{s.bills_created}</TableCell>
                <TableCell className="text-right font-semibold">{fmtINR(Number(s.sales_amount))}</TableCell>
                <TableCell className="text-right">{fmtINR(Number(s.cash_collected))}</TableCell>
                <TableCell className="text-right">{fmtINR(Number(s.upi_collected))}</TableCell>
                <TableCell className="text-right">{fmtINR(Number(s.card_collected))}</TableCell>
                <TableCell className="text-right">{fmtINR(Number(s.credit_sales))}</TableCell>
                <TableCell className="text-right">{s.cancelled_bills}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.device_name || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <Card className="p-3">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
    <div className="text-2xl font-bold mt-1">{value}</div>
  </Card>
);
