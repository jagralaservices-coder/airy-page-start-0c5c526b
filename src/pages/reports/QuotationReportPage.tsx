import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useOwnerStore } from '@/hooks/useOwnerStore';
import { getCurrentStoreId } from '@/lib/storeIdentity';
import { listQuotations, Quotation, STATUS_COLORS, expireOldQuotations } from '@/lib/quotations';
import { exportCSV, exportExcel, exportPDF, printReport } from '@/lib/reports/exporters';
import { toast } from '@/hooks/use-toast';

const QuotationReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { isOwner } = useOwnerStore();
  const storeId = getCurrentStoreId();
  const [rows, setRows] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customer, setCustomer] = useState('');
  const [salesperson, setSalesperson] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      await expireOldQuotations();
      const data = await listQuotations(isOwner ? 'all' : (storeId ? [storeId] : []));
      setRows(data);
    } catch (e: any) { toast({ title: 'Failed to load', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  })(); /* eslint-disable-next-line */ }, []);

  const salespeople = useMemo(() => Array.from(new Set(rows.map(r => r.salesperson_name).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (status !== 'all' && r.status !== status) return false;
    if (salesperson !== 'all' && r.salesperson_name !== salesperson) return false;
    if (customer && !(`${r.customer_name || ''} ${r.customer_phone || ''}`.toLowerCase().includes(customer.toLowerCase()))) return false;
    const d = r.created_at?.slice(0, 10) || '';
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }), [rows, status, salesperson, customer, from, to]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const approved = filtered.filter(r => r.status === 'approved').length;
    const rejected = filtered.filter(r => r.status === 'rejected').length;
    const expired = filtered.filter(r => r.status === 'expired').length;
    const converted = filtered.filter(r => r.status === 'converted').length;
    const salesValue = filtered.filter(r => r.status === 'converted').reduce((s, r) => s + r.grand_total, 0);
    const totalValue = filtered.reduce((s, r) => s + r.grand_total, 0);
    const convPct = total > 0 ? (converted / total) * 100 : 0;
    return { total, approved, rejected, expired, converted, salesValue, totalValue, convPct };
  }, [filtered]);

  const buildPayload = () => ({
    title: 'Quotation Report',
    subtitle: 'Quotations summary and conversion analysis',
    dateRange: from || to ? `${from || '...'} to ${to || '...'}` : 'All time',
    storeName: isOwner ? 'All stores' : 'Current store',
    kpis: [
      { label: 'Total Quotations', value: kpis.total },
      { label: 'Approved', value: kpis.approved },
      { label: 'Rejected', value: kpis.rejected },
      { label: 'Expired', value: kpis.expired },
      { label: 'Converted', value: kpis.converted },
      { label: 'Conversion %', value: kpis.convPct.toFixed(1) + '%' },
      { label: 'Sales Value (Converted)', value: kpis.salesValue.toFixed(2) },
      { label: 'Total Quote Value', value: kpis.totalValue.toFixed(2) },
    ],
    sections: [{
      title: 'Quotations',
      headers: ['Quote #', 'Date', 'Customer', 'Salesperson', 'Status', 'Expiry', 'Grand Total'],
      rows: filtered.map(r => [
        r.quotation_no,
        r.created_at?.slice(0, 10) || '',
        r.customer_name || '',
        r.salesperson_name || '',
        r.status,
        r.expiry_date?.slice(0, 10) || '',
        r.grand_total,
      ]),
    }],
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Quotation Report</h1>
          <p className="text-sm text-muted-foreground">Track quotations, approvals, conversions and sales value.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportCSV(buildPayload())}><Download className="h-4 w-4 mr-1" />CSV</Button>
        <Button size="sm" variant="outline" onClick={() => exportExcel(buildPayload())}><Download className="h-4 w-4 mr-1" />Excel</Button>
        <Button size="sm" variant="outline" onClick={() => exportPDF(buildPayload())}><Download className="h-4 w-4 mr-1" />PDF</Button>
        <Button size="sm" variant="outline" onClick={() => printReport(buildPayload())}><Printer className="h-4 w-4 mr-1" />Print</Button>
      </div>

      <Card className="p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div><Label className="text-xs">Customer</Label><Input placeholder="Name / phone" value={customer} onChange={e => setCustomer(e.target.value)} /></div>
        <div><Label className="text-xs">Salesperson</Label>
          <Select value={salesperson} onValueChange={setSalesperson}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {salespeople.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Total Quotations', v: kpis.total },
          { l: 'Approved', v: kpis.approved },
          { l: 'Rejected', v: kpis.rejected },
          { l: 'Expired', v: kpis.expired },
          { l: 'Converted', v: kpis.converted },
          { l: 'Conversion %', v: kpis.convPct.toFixed(1) + '%' },
          { l: 'Sales Value', v: kpis.salesValue.toFixed(2) },
          { l: 'Total Quote Value', v: kpis.totalValue.toFixed(2) },
        ].map(k => (
          <Card key={k.l} className="p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{k.l}</div>
            <div className="text-2xl font-bold text-primary mt-1">{k.v}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Salesperson</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Grand Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No quotations</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.quotation_no}</TableCell>
                <TableCell className="text-xs">{r.created_at?.slice(0, 10)}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{r.customer_name || '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_phone}</div>
                </TableCell>
                <TableCell className="text-xs">{r.salesperson_name || '—'}</TableCell>
                <TableCell><Badge className={`${STATUS_COLORS[r.status]} text-white capitalize`}>{r.status}</Badge></TableCell>
                <TableCell className="text-xs">{r.expiry_date?.slice(0, 10) || '—'}</TableCell>
                <TableCell className="text-right font-semibold">{r.grand_total.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default QuotationReportPage;
