import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateRange } from 'react-day-picker';
import { ArrowLeft, Download, Printer, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { usePOS } from '@/contexts/POSContext';
import { getCustomers, getInventory, Order } from '@/lib/store';
import { downloadCSV, fmtINR } from '@/lib/reportCsvUtils';
import { printReport } from '@/lib/reportPrintUtils';

type ReportKey =
  | 'item' | 'tax' | 'payment' | 'staff'
  | 'customer' | 'hourly' | 'discount' | 'inventory';

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'item', label: 'Item-wise Sales' },
  { key: 'tax', label: 'Tax & GST' },
  { key: 'payment', label: 'Payment Mode' },
  { key: 'staff', label: 'Staff Performance' },
  { key: 'customer', label: 'Customer Report' },
  { key: 'hourly', label: 'Hourly / Day-wise' },
  { key: 'discount', label: 'Discount & Cancellation' },
  { key: 'inventory', label: 'Inventory / Stock' },
];

const MoreReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { orders } = usePOS();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 7);
    return { from: start, to: now };
  });
  const initialKey = ((): ReportKey => {
    const k = new URLSearchParams(window.location.search).get('r') as ReportKey | null;
    return k && REPORTS.some(r => r.key === k) ? k : 'item';
  })();
  const [active, setActive] = useState<ReportKey>(initialKey);

  const filteredOrders = useMemo<Order[]>(() => {
    const from = dateRange?.from ? new Date(dateRange.from).setHours(0,0,0,0) : 0;
    const to = dateRange?.to ? new Date(dateRange.to).setHours(23,59,59,999)
              : dateRange?.from ? new Date(dateRange.from).setHours(23,59,59,999) : Date.now();
    return (orders || []).filter(o => {
      const t = new Date(o.createdAt).getTime();
      return t >= from && t <= to;
    });
  }, [orders, dateRange]);

  const completed = filteredOrders.filter(o => o.status !== 'cancelled' && o.billPrinted !== false);
  const cancelled = filteredOrders.filter(o => o.status === 'cancelled');

  const dateLabel = dateRange?.from
    ? `${dateRange.from.toLocaleDateString('en-IN')} - ${(dateRange.to || dateRange.from).toLocaleDateString('en-IN')}`
    : 'All Time';

  // ===== Item-wise =====
  const itemRows = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; category: string }>();
    completed.forEach(o => o.items.forEach(it => {
      const k = it.id || it.name;
      const cur = map.get(k) || { name: it.name, qty: 0, revenue: 0, category: (it as any).category || '-' };
      cur.qty += it.quantity;
      cur.revenue += (it.price * it.quantity);
      map.set(k, cur);
    }));
    return Array.from(map.values()).sort((a,b) => b.revenue - a.revenue);
  }, [completed]);

  // ===== Tax / GST =====
  const taxRows = useMemo(() => {
    const totalTax = completed.reduce((s,o) => s + (o.tax || 0), 0);
    const taxable = completed.reduce((s,o) => s + (o.subtotal || 0) - (o.discount || 0), 0);
    const gross = completed.reduce((s,o) => s + o.total, 0);
    const cgst = totalTax / 2, sgst = totalTax / 2;
    return { totalTax, taxable, gross, cgst, sgst, count: completed.length };
  }, [completed]);

  // ===== Payment =====
  const paymentRows = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    completed.forEach(o => {
      if (o.paymentMethod === 'part' && o.paymentBreakdown) {
        Object.entries(o.paymentBreakdown).forEach(([k, v]) => {
          const cur = m.get(k) || { count: 0, total: 0 };
          cur.total += Number(v) || 0;
          m.set(k, cur);
        });
        const cur = m.get('__bills__') || { count: 0, total: 0 };
        cur.count += 1;
        m.set('__bills__', cur);
      } else {
        const k = o.paymentMethod || 'cash';
        const cur = m.get(k) || { count: 0, total: 0 };
        cur.count += 1; cur.total += o.total;
        m.set(k, cur);
      }
    });
    return Array.from(m.entries()).filter(([k]) => k !== '__bills__')
      .map(([method, v]) => ({ method, ...v }))
      .sort((a,b) => b.total - a.total);
  }, [completed]);

  // ===== Staff =====
  const staffRows = useMemo(() => {
    const m = new Map<string, { name: string; bills: number; revenue: number }>();
    completed.forEach(o => {
      const name = (o as any).createdBy || (o as any).cashierName || (o as any).staffName || 'Unknown';
      const cur = m.get(name) || { name, bills: 0, revenue: 0 };
      cur.bills += 1; cur.revenue += o.total;
      m.set(name, cur);
    });
    return Array.from(m.values()).sort((a,b) => b.revenue - a.revenue);
  }, [completed]);

  // ===== Customer =====
  const customerRows = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; orders: number; spent: number }>();
    completed.forEach(o => {
      const phone = o.customerPhone || '';
      const name = o.customerName || 'Walk-in';
      const k = phone || name;
      if (!phone && name === 'Walk-in') return;
      const cur = m.get(k) || { name, phone, orders: 0, spent: 0 };
      cur.orders += 1; cur.spent += o.total;
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a,b) => b.spent - a.spent);
  }, [completed]);

  // ===== Hourly / Day-wise =====
  const hourlyRows = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, bills: 0, revenue: 0 }));
    const days = new Map<string, { day: string; bills: number; revenue: number }>();
    completed.forEach(o => {
      const d = new Date(o.createdAt);
      hours[d.getHours()].bills += 1;
      hours[d.getHours()].revenue += o.total;
      const dayKey = d.toLocaleDateString('en-IN');
      const cur = days.get(dayKey) || { day: dayKey, bills: 0, revenue: 0 };
      cur.bills += 1; cur.revenue += o.total;
      days.set(dayKey, cur);
    });
    return { hours, days: Array.from(days.values()) };
  }, [completed]);

  // ===== Discount / Cancellation =====
  const discountRows = useMemo(() => {
    const totalDiscount = completed.reduce((s,o) => s + (o.discount || 0), 0);
    const discountedBills = completed.filter(o => (o.discount || 0) > 0);
    const cancelledTotal = cancelled.reduce((s,o) => s + o.total, 0);
    return {
      totalDiscount,
      discountedBills: discountedBills.length,
      cancelledCount: cancelled.length,
      cancelledTotal,
      cancelledList: cancelled.slice(0, 50),
    };
  }, [completed, cancelled]);

  // ===== Inventory =====
  const inventoryRows = useMemo(() => {
    const inv = getInventory();
    return inv.map(i => ({
      name: i.name,
      qty: i.quantity,
      unit: i.unit,
      min: i.minStock,
      cost: i.costPerUnit,
      value: (i.quantity || 0) * (i.costPerUnit || 0),
      low: (i.quantity || 0) <= (i.minStock || 0),
    })).sort((a,b) => Number(b.low) - Number(a.low));
  }, [active]);

  // ===== Export helpers =====
  const exportCurrent = (mode: 'csv' | 'print') => {
    const title = REPORTS.find(r => r.key === active)?.label || 'Report';
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    switch (active) {
      case 'item':
        headers = ['Item', 'Category', 'Qty Sold', 'Revenue'];
        rows = itemRows.map(r => [r.name, r.category, r.qty, r.revenue.toFixed(2)]);
        break;
      case 'tax':
        headers = ['Metric', 'Value'];
        rows = [
          ['Total Bills', taxRows.count],
          ['Gross Sales', taxRows.gross.toFixed(2)],
          ['Taxable Amount', taxRows.taxable.toFixed(2)],
          ['CGST', taxRows.cgst.toFixed(2)],
          ['SGST', taxRows.sgst.toFixed(2)],
          ['Total Tax', taxRows.totalTax.toFixed(2)],
        ];
        break;
      case 'payment':
        headers = ['Payment Mode', 'Bills', 'Amount'];
        rows = paymentRows.map(r => [r.method.toUpperCase(), r.count, r.total.toFixed(2)]);
        break;
      case 'staff':
        headers = ['Staff', 'Bills', 'Revenue', 'Avg Bill'];
        rows = staffRows.map(r => [r.name, r.bills, r.revenue.toFixed(2), (r.revenue / r.bills).toFixed(2)]);
        break;
      case 'customer':
        headers = ['Customer', 'Phone', 'Orders', 'Total Spent'];
        rows = customerRows.map(r => [r.name, r.phone, r.orders, r.spent.toFixed(2)]);
        break;
      case 'hourly':
        headers = ['Hour', 'Bills', 'Revenue'];
        rows = hourlyRows.hours.map(h => [`${h.hour}:00`, h.bills, h.revenue.toFixed(2)]);
        break;
      case 'discount':
        headers = ['Metric', 'Value'];
        rows = [
          ['Total Discount Given', discountRows.totalDiscount.toFixed(2)],
          ['Bills with Discount', discountRows.discountedBills],
          ['Cancelled Bills', discountRows.cancelledCount],
          ['Cancelled Amount', discountRows.cancelledTotal.toFixed(2)],
        ];
        break;
      case 'inventory':
        headers = ['Item', 'Qty', 'Unit', 'Min Stock', 'Cost/Unit', 'Stock Value', 'Status'];
        rows = inventoryRows.map(r => [r.name, r.qty, r.unit, r.min, r.cost.toFixed(2), r.value.toFixed(2), r.low ? 'LOW' : 'OK']);
        break;
    }

    if (mode === 'csv') {
      downloadCSV(`${title.replace(/\s+/g,'_')}_${Date.now()}`, headers, rows);
    } else {
      printReport(
        { title, dateRange: dateLabel, generatedAt: new Date() },
        [{ type: 'table', data: { headers, rows } }]
      );
    }
  };

  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">More Reports</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button variant="outline" size="sm" onClick={() => exportCurrent('csv')}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCurrent('print')}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCurrent('print')}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as ReportKey)}>
        <TabsList className="flex flex-wrap h-auto justify-start">
          {REPORTS.map(r => (
            <TabsTrigger key={r.key} value={r.key} className="text-xs sm:text-sm">{r.label}</TabsTrigger>
          ))}
        </TabsList>

        {/* Item-wise */}
        <TabsContent value="item">
          <Card>
            <CardHeader><CardTitle>Item-wise Sales ({dateLabel})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead><TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {itemRows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                  {itemRows.map((r,i) => (
                    <TableRow key={i}><TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell className="text-right">{r.qty}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax */}
        <TabsContent value="tax">
          <Card>
            <CardHeader><CardTitle>Tax & GST Summary ({dateLabel})</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                ['Total Bills', taxRows.count],
                ['Gross Sales', fmtINR(taxRows.gross)],
                ['Taxable Amount', fmtINR(taxRows.taxable)],
                ['CGST', fmtINR(taxRows.cgst)],
                ['SGST', fmtINR(taxRows.sgst)],
                ['Total Tax', fmtINR(taxRows.totalTax)],
              ].map(([l, v]) => (
                <div key={l as string} className="border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">{l}</div>
                  <div className="text-xl font-bold mt-1">{v}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment */}
        <TabsContent value="payment">
          <Card>
            <CardHeader><CardTitle>Payment Mode Breakdown ({dateLabel})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {paymentRows.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                  {paymentRows.map((r) => (
                    <TableRow key={r.method}>
                      <TableCell className="uppercase font-medium">{r.method}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff */}
        <TabsContent value="staff">
          <Card>
            <CardHeader><CardTitle>Staff / Cashier Performance ({dateLabel})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg Bill</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {staffRows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                  {staffRows.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{r.bills}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.revenue)}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.revenue / r.bills)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customer */}
        <TabsContent value="customer">
          <Card>
            <CardHeader><CardTitle>Top Customers ({dateLabel})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Customer</TableHead><TableHead>Phone</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {customerRows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                  {customerRows.map((r,i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.phone || '-'}</TableCell>
                      <TableCell className="text-right">{r.orders}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.spent)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hourly */}
        <TabsContent value="hourly">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Hourly Sales</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Hour</TableHead><TableHead className="text-right">Bills</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {hourlyRows.hours.filter(h => h.bills > 0).map(h => (
                      <TableRow key={h.hour}>
                        <TableCell>{String(h.hour).padStart(2,'0')}:00 - {String(h.hour+1).padStart(2,'0')}:00</TableCell>
                        <TableCell className="text-right">{h.bills}</TableCell>
                        <TableCell className="text-right">{fmtINR(h.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    {hourlyRows.hours.every(h => h.bills === 0) && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Day-wise Sales</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Bills</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {hourlyRows.days.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                    {hourlyRows.days.map(d => (
                      <TableRow key={d.day}>
                        <TableCell>{d.day}</TableCell>
                        <TableCell className="text-right">{d.bills}</TableCell>
                        <TableCell className="text-right">{fmtINR(d.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Discount / Cancellation */}
        <TabsContent value="discount">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Total Discount</div><div className="text-lg font-bold">{fmtINR(discountRows.totalDiscount)}</div></div>
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Discounted Bills</div><div className="text-lg font-bold">{discountRows.discountedBills}</div></div>
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Cancelled Bills</div><div className="text-lg font-bold">{discountRows.cancelledCount}</div></div>
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Cancelled Amount</div><div className="text-lg font-bold">{fmtINR(discountRows.cancelledTotal)}</div></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Cancelled Bills</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Bill</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {discountRows.cancelledList.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No cancellations</TableCell></TableRow>}
                    {discountRows.cancelledList.map(o => (
                      <TableRow key={o.id}>
                        <TableCell>{o.billNumber || o.id.slice(0,8)}</TableCell>
                        <TableCell className="text-xs">{o.cancelReason || '-'}</TableCell>
                        <TableCell className="text-right">{fmtINR(o.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Inventory */}
        <TabsContent value="inventory">
          <Card>
            <CardHeader><CardTitle>Inventory / Stock Report</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {inventoryRows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No inventory items</TableCell></TableRow>}
                  {inventoryRows.map((r,i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{r.qty}</TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="text-right">{r.min}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.cost)}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.value)}</TableCell>
                      <TableCell>
                        <span className={r.low ? 'text-destructive font-semibold' : 'text-success'}>
                          {r.low ? 'LOW' : 'OK'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MoreReportsPage;
