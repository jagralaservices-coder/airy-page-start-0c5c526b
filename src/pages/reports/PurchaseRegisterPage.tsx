import React, { useEffect, useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange } from '@/lib/reports/invPurchHelpers';

interface PORow {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  createdAt: string;
  expectedDate: string;
  receivedDate: string | null;
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
}

const PurchaseRegisterPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PORow[]>([]);
  const [loading, setLoading] = useState(true);
  const range = presetToRange(preset, customRange);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, expected_date, received_date, subtotal, tax, total, notes, created_at, suppliers(name)')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (!error && data) {
        setRows(data.map((r: any) => ({
          id: r.id, poNumber: r.po_number,
          supplier: r.suppliers?.name || '—',
          status: r.status,
          createdAt: r.created_at,
          expectedDate: r.expected_date,
          receivedDate: r.received_date,
          subtotal: Number(r.subtotal || 0),
          tax: Number(r.tax || 0),
          total: Number(r.total || 0),
          notes: r.notes || '',
        })));
      }
      setLoading(false);
    })();
  }, []);

  const suppliers = useMemo(() => Array.from(new Set(rows.map(r => r.supplier))).filter(s => s !== '—'), [rows]);
  const filtered = useMemo(() => rows
    .filter(r => inRange(r.createdAt, range))
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => supplierFilter === 'all' || r.supplier === supplierFilter)
    .filter(r => !search || r.poNumber.toLowerCase().includes(search.toLowerCase()) || r.supplier.toLowerCase().includes(search.toLowerCase())),
    [rows, range, statusFilter, supplierFilter, search]);

  const totalAmount = filtered.reduce((s, r) => s + r.total, 0);
  const totalTax = filtered.reduce((s, r) => s + r.tax, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Purchase Register"
        subtitle="All purchase orders by period"
        icon={<FileText className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
        buildPayload={() => ({
          title: 'Purchase Register',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Orders', value: filtered.length },
            { label: 'Total Amount', value: fmtINR(totalAmount) },
            { label: 'GST', value: fmtINR(totalTax) },
          ],
          sections: [{
            title: 'Purchase Orders',
            headers: ['PO#', 'Supplier', 'Order Date', 'Expected', 'Received', 'Subtotal', 'GST', 'Total', 'Status'],
            rows: filtered.map(r => [
              r.poNumber, r.supplier,
              new Date(r.createdAt).toLocaleDateString('en-IN'),
              r.expectedDate ? new Date(r.expectedDate).toLocaleDateString('en-IN') : '—',
              r.receivedDate ? new Date(r.receivedDate).toLocaleDateString('en-IN') : '—',
              fmtINR(r.subtotal), fmtINR(r.tax), fmtINR(r.total), r.status,
            ]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Orders</div><div className="text-lg font-bold">{filtered.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Amount</div><div className="text-lg font-bold">{fmtINR(totalAmount)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">GST</div><div className="text-lg font-bold">{fmtINR(totalTax)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Suppliers</div><div className="text-lg font-bold">{suppliers.length}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO#</TableHead><TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead><TableHead>Expected</TableHead><TableHead>Received</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">Loading…</TableCell></TableRow>
                  : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No purchase orders</TableCell></TableRow>
                  : filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.poNumber}</TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell className="text-xs">{new Date(r.createdAt).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell className="text-xs">{r.expectedDate ? new Date(r.expectedDate).toLocaleDateString('en-IN') : '—'}</TableCell>
                      <TableCell className="text-xs">{r.receivedDate ? new Date(r.receivedDate).toLocaleDateString('en-IN') : '—'}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.subtotal)}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.tax)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtINR(r.total)}</TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PurchaseRegisterPage;
