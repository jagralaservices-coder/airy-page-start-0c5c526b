import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Undo2, Download, Printer, FileSpreadsheet, Loader2,
} from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';

import { supabase } from '@/integrations/supabase/client';
import { useReportScope } from '@/lib/reports/scope';
import { exportCSV, exportExcel, exportPDF, printReport } from '@/lib/reports/exporters';
import { useLocale } from '@/contexts/LocaleContext';

// ---------- Constants ----------
const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'customer_changed_mind', label: 'Customer Changed Mind' },
  { value: 'quality_issue', label: 'Quality Issue' },
  { value: 'billing_mistake', label: 'Billing Mistake' },
  { value: 'other', label: 'Other' },
];
const reasonLabel = (k: string) =>
  REASON_OPTIONS.find(r => r.value === k)?.label || (k ? k.replace(/_/g, ' ') : '—');

const METHOD_OPTIONS = ['cash', 'upi', 'card', 'credit_note', 'exchange'];
const COLORS = ['#1e3a8a', '#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#f59e0b', '#475569'];

// ---------- Types ----------
interface ReturnRow {
  id: string;
  store_id: string;
  return_no: string;
  original_invoice_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  return_amount: number;
  refund_amount: number;
  exchange_amount: number;
  credit_note_amount: number;
  refund_method: string;
  reason: string;
  reason_notes: string | null;
  cashier_name: string | null;
  returned_at: string;
}
interface ItemRow {
  id: string;
  return_id: string;
  product_id: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}
interface StoreLite { id: string; name: string; }

// ---------- Page ----------
const SalesReturnReportPage: React.FC = () => {
  const navigate = useNavigate();
  const scope = useReportScope();
  const { formatCurrency } = useLocale();

  const today = new Date();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29);

  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: monthAgo, to: today });
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [cashierSearch, setCashierSearch] = useState('');

  const [stores, setStores] = useState<StoreLite[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [storeNameById, setStoreNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [salesTotal, setSalesTotal] = useState<number>(0);

  // ---------- Load store list (for owner filter) ----------
  useEffect(() => {
    (async () => {
      if (scope.isOwner) {
        const { data } = await (supabase as any)
          .from('stores').select('id, name').eq('is_active', true).order('name');
        setStores(data ?? []);
        const map: Record<string, string> = {};
        (data ?? []).forEach((s: StoreLite) => { map[s.id] = s.name; });
        setStoreNameById(map);
      } else if (scope.storeId) {
        setStores([{ id: scope.storeId, name: scope.storeName }]);
        setStoreNameById({ [scope.storeId]: scope.storeName });
      }
    })();
  }, [scope.isOwner, scope.storeId, scope.storeName]);

  // ---------- Fetch returns ----------
  const fetchReport = async () => {
    if (!dateRange?.from) { toast.error('Select a date range'); return; }
    setLoading(true);
    try {
      const from = new Date(dateRange.from); from.setHours(0, 0, 0, 0);
      const to = new Date(dateRange.to ?? dateRange.from); to.setHours(23, 59, 59, 999);

      // store scope
      let storeIds: string[] = [];
      if (scope.isOwner) {
        storeIds = storeFilter === 'all'
          ? stores.map(s => s.id)
          : [storeFilter];
      } else if (scope.storeId) {
        storeIds = [scope.storeId];
      }
      if (storeIds.length === 0) { setReturns([]); setItems([]); setSalesTotal(0); return; }

      let q = (supabase as any)
        .from('sales_returns')
        .select('*')
        .in('store_id', storeIds)
        .gte('returned_at', from.toISOString())
        .lte('returned_at', to.toISOString())
        .order('returned_at', { ascending: false });
      if (reasonFilter !== 'all') q = q.eq('reason', reasonFilter);
      if (methodFilter !== 'all') q = q.eq('refund_method', methodFilter);

      const { data: rData, error: rErr } = await q;
      if (rErr) throw rErr;
      const rRows: ReturnRow[] = rData ?? [];
      setReturns(rRows);

      // child items
      const ids = rRows.map(r => r.id);
      let iRows: ItemRow[] = [];
      if (ids.length) {
        const { data: iData, error: iErr } = await (supabase as any)
          .from('sales_return_items')
          .select('*')
          .in('return_id', ids);
        if (iErr) throw iErr;
        iRows = iData ?? [];
      }
      setItems(iRows);

      // sales total over the same window (for return %)
      const { data: oData } = await (supabase as any)
        .from('orders')
        .select('total, store_id, created_at')
        .in('store_id', storeIds)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString());
      const oTotal = (oData ?? []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      setSalesTotal(oTotal);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  // initial + scope/filter change
  useEffect(() => { if (stores.length || !scope.isOwner) fetchReport(); /* eslint-disable-next-line */ },
    [scope.storeId, stores.length]);

  // ---------- Apply client-side filters (cust/prod/cashier/category) ----------
  const filteredItems = useMemo(() => {
    let list = items;
    if (categoryFilter !== 'all') list = list.filter(i => (i.category || '') === categoryFilter);
    if (productSearch.trim()) {
      const t = productSearch.trim().toLowerCase();
      list = list.filter(i => i.product_name.toLowerCase().includes(t));
    }
    return list;
  }, [items, categoryFilter, productSearch]);

  const itemsByReturn = useMemo(() => {
    const m: Record<string, ItemRow[]> = {};
    filteredItems.forEach(i => { (m[i.return_id] ||= []).push(i); });
    return m;
  }, [filteredItems]);

  const filteredReturns = useMemo(() => {
    let list = returns;
    if (customerSearch.trim()) {
      const t = customerSearch.trim().toLowerCase();
      list = list.filter(r =>
        (r.customer_name || '').toLowerCase().includes(t) ||
        (r.customer_phone || '').toLowerCase().includes(t));
    }
    if (cashierSearch.trim()) {
      const t = cashierSearch.trim().toLowerCase();
      list = list.filter(r => (r.cashier_name || '').toLowerCase().includes(t));
    }
    // when product/category filter active, only keep returns that still have items
    if (categoryFilter !== 'all' || productSearch.trim()) {
      list = list.filter(r => (itemsByReturn[r.id] || []).length > 0);
    }
    return list;
  }, [returns, customerSearch, cashierSearch, categoryFilter, productSearch, itemsByReturn]);

  // ---------- Aggregates / KPIs ----------
  const totals = useMemo(() => {
    const totalReturnAmt = filteredReturns.reduce((s, r) => s + Number(r.return_amount || 0), 0);
    const totalRefund = filteredReturns.reduce((s, r) => s + Number(r.refund_amount || 0), 0);
    const totalExchange = filteredReturns.reduce((s, r) => s + Number(r.exchange_amount || 0), 0);
    const totalCredit = filteredReturns.reduce((s, r) => s + Number(r.credit_note_amount || 0), 0);
    const totalItems = filteredReturns.reduce((s, r) => s + (itemsByReturn[r.id] || []).reduce((a, i) => a + Number(i.quantity || 0), 0), 0);
    const returnPct = salesTotal > 0 ? (totalReturnAmt / salesTotal) * 100 : 0;
    return {
      bills: filteredReturns.length,
      items: totalItems,
      returnAmt: totalReturnAmt,
      refund: totalRefund,
      exchange: totalExchange,
      credit: totalCredit,
      returnPct,
      netImpact: salesTotal - totalReturnAmt,
    };
  }, [filteredReturns, itemsByReturn, salesTotal]);

  // ---------- Charts ----------
  const trendData = useMemo(() => {
    const byDay: Record<string, number> = {};
    filteredReturns.forEach(r => {
      const k = format(new Date(r.returned_at), 'dd MMM');
      byDay[k] = (byDay[k] || 0) + Number(r.return_amount || 0);
    });
    return Object.entries(byDay).map(([date, amount]) => ({ date, amount }));
  }, [filteredReturns]);

  const topProducts = useMemo(() => {
    const m: Record<string, { name: string; qty: number; amount: number }> = {};
    filteredItems
      .filter(i => filteredReturns.some(r => r.id === i.return_id))
      .forEach(i => {
        const k = i.product_name;
        m[k] ||= { name: k, qty: 0, amount: 0 };
        m[k].qty += Number(i.quantity || 0);
        m[k].amount += Number(i.line_total || 0);
      });
    return Object.values(m).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [filteredItems, filteredReturns]);

  const reasonBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    filteredReturns.forEach(r => { m[r.reason] = (m[r.reason] || 0) + Number(r.return_amount || 0); });
    return Object.entries(m).map(([k, v], idx) => ({
      name: reasonLabel(k),
      value: Number(v.toFixed(2)),
      color: COLORS[idx % COLORS.length],
    }));
  }, [filteredReturns]);

  const refundAnalysis = useMemo(() => {
    const m: Record<string, number> = {};
    filteredReturns.forEach(r => { m[r.refund_method] = (m[r.refund_method] || 0) + Number(r.refund_amount || 0); });
    return Object.entries(m).map(([k, v], idx) => ({
      method: (k || 'unknown').toUpperCase(),
      amount: Number(v.toFixed(2)),
      color: COLORS[idx % COLORS.length],
    }));
  }, [filteredReturns]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.category) s.add(i.category); });
    return Array.from(s).sort();
  }, [items]);

  // ---------- Export payload ----------
  const buildPayload = () => ({
    title: 'Sales Return Report',
    subtitle: scope.isOwner ? (storeFilter === 'all' ? 'All Outlets' : (storeNameById[storeFilter] || 'Outlet')) : scope.storeName,
    dateRange: dateRange?.from
      ? `${format(dateRange.from, 'dd MMM yyyy')} → ${format(dateRange.to ?? dateRange.from, 'dd MMM yyyy')}`
      : '',
    storeName: scope.storeName,
    kpis: [
      { label: 'Returned Bills', value: totals.bills },
      { label: 'Returned Items', value: totals.items },
      { label: 'Refund Amount', value: formatCurrency(totals.refund) },
      { label: 'Exchange Amount', value: formatCurrency(totals.exchange) },
      { label: 'Credit Note Amount', value: formatCurrency(totals.credit) },
      { label: 'Return %', value: `${totals.returnPct.toFixed(2)}%` },
      { label: 'Net Sales Impact', value: formatCurrency(totals.netImpact) },
    ],
    sections: [
      {
        title: 'Returns',
        headers: ['Return No', 'Original Invoice', 'Customer', 'Product', 'Category', 'Qty', 'Return Amt', 'Refund', 'Exchange', 'Credit Note', 'Method', 'Reason', 'Cashier', 'Store', 'Date', 'Time'],
        rows: filteredReturns.flatMap(r => {
          const its = itemsByReturn[r.id] || [];
          if (its.length === 0) {
            return [[
              r.return_no, r.original_invoice_no || '—', r.customer_name || '—',
              '—', '—', 0,
              Math.round(r.return_amount), Math.round(r.refund_amount),
              Math.round(r.exchange_amount), Math.round(r.credit_note_amount),
              (r.refund_method || '').toUpperCase(),
              reasonLabel(r.reason), r.cashier_name || '—',
              storeNameById[r.store_id] || '—',
              format(new Date(r.returned_at), 'dd MMM yyyy'),
              format(new Date(r.returned_at), 'HH:mm'),
            ]];
          }
          return its.map(i => [
            r.return_no, r.original_invoice_no || '—', r.customer_name || '—',
            i.product_name, i.category || '—', Number(i.quantity || 0),
            Math.round(r.return_amount), Math.round(r.refund_amount),
            Math.round(r.exchange_amount), Math.round(r.credit_note_amount),
            (r.refund_method || '').toUpperCase(),
            reasonLabel(r.reason), r.cashier_name || '—',
            storeNameById[r.store_id] || '—',
            format(new Date(r.returned_at), 'dd MMM yyyy'),
            format(new Date(r.returned_at), 'HH:mm'),
          ]);
        }),
      },
      {
        title: 'Return Reasons',
        headers: ['Reason', 'Amount'],
        rows: reasonBreakdown.map(r => [r.name, Math.round(Number(r.value))]),
      },
      {
        title: 'Refund Analysis',
        headers: ['Method', 'Amount'],
        rows: refundAnalysis.map(r => [r.method, Math.round(Number(r.amount))]),
      },
    ],
  });

  const exportAs = (kind: 'csv' | 'excel' | 'pdf' | 'print') => {
    const p = buildPayload();
    if (kind === 'csv') exportCSV(p);
    else if (kind === 'excel') exportExcel(p);
    else if (kind === 'pdf') exportPDF(p);
    else printReport(p);
  };

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="p-2 bg-primary/10 rounded-lg shrink-0"><Undo2 className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">Sales Return Report</h1>
              <p className="text-xs text-muted-foreground truncate">
                {scope.isOwner ? 'Company / Multi-store' : scope.storeName} • {scope.isOwner ? 'Owner view' : 'Store view'}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => exportAs('csv')}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportAs('excel')}><FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportAs('print')}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
            <Button variant="outline" size="sm" onClick={() => exportAs('pdf')}>PDF</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-4 pb-3 items-end">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Date Range</div>
            <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Reason</div>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                {REASON_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Payment / Refund</div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {METHOD_OPTIONS.map(m => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Category</div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Customer</div>
            <Input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Name / phone" className="h-9 w-40 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Product</div>
            <Input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Product name" className="h-9 w-40 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Cashier</div>
            <Input value={cashierSearch} onChange={e => setCashierSearch(e.target.value)} placeholder="Cashier name" className="h-9 w-36 text-sm" />
          </div>
          {scope.isOwner && stores.length > 1 && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Outlet</div>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outlets</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={fetchReport} disabled={loading} className="h-9">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Apply
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { l: 'Returned Bills', v: String(totals.bills) },
            { l: 'Returned Items', v: String(totals.items) },
            { l: 'Refund Amount', v: formatCurrency(totals.refund) },
            { l: 'Exchange Amount', v: formatCurrency(totals.exchange) },
            { l: 'Credit Note', v: formatCurrency(totals.credit) },
            { l: 'Return %', v: `${totals.returnPct.toFixed(2)}%` },
            { l: 'Net Sales Impact', v: formatCurrency(totals.netImpact) },
          ].map(k => (
            <Card key={k.l}>
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight break-words">{k.l}</div>
                <div className="text-base font-bold mt-1 truncate" title={k.v}>{k.v}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Returns</TabsTrigger>
            <TabsTrigger value="reasons">Reasons</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>

          {/* Returns Table */}
          <TabsContent value="table">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Return No</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Return Amt</TableHead>
                        <TableHead className="text-right">Refund</TableHead>
                        <TableHead className="text-right">Exchange</TableHead>
                        <TableHead className="text-right">Credit Note</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Cashier</TableHead>
                        {scope.isOwner && <TableHead>Store</TableHead>}
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</TableCell></TableRow>
                      ) : filteredReturns.length === 0 ? (
                        <TableRow><TableCell colSpan={15} className="text-center py-10 text-muted-foreground">No returns found in the selected period.</TableCell></TableRow>
                      ) : filteredReturns.map(r => {
                        const its = itemsByReturn[r.id] || [];
                        const qty = its.reduce((s, i) => s + Number(i.quantity || 0), 0);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.return_no}</TableCell>
                            <TableCell className="text-muted-foreground">{r.original_invoice_no || '—'}</TableCell>
                            <TableCell>
                              <div className="text-sm">{r.customer_name || '—'}</div>
                              {r.customer_phone && <div className="text-[11px] text-muted-foreground">{r.customer_phone}</div>}
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              {its.length === 0 ? <span className="text-muted-foreground">—</span> : (
                                <div className="space-y-0.5">
                                  {its.slice(0, 3).map(i => (
                                    <div key={i.id} className="text-xs truncate" title={i.product_name}>
                                      <span className="font-medium">{i.product_name}</span>
                                      {i.category && <span className="text-muted-foreground"> · {i.category}</span>}
                                    </div>
                                  ))}
                                  {its.length > 3 && <div className="text-[10px] text-muted-foreground">+{its.length - 3} more</div>}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{qty}</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(r.return_amount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.refund_amount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.exchange_amount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.credit_note_amount)}</TableCell>
                            <TableCell><Badge variant="secondary" className="text-[10px] uppercase">{r.refund_method}</Badge></TableCell>
                            <TableCell><span className="text-xs">{reasonLabel(r.reason)}</span></TableCell>
                            <TableCell className="text-xs">{r.cashier_name || '—'}</TableCell>
                            {scope.isOwner && <TableCell className="text-xs">{storeNameById[r.store_id] || '—'}</TableCell>}
                            <TableCell className="text-xs">{format(new Date(r.returned_at), 'dd MMM yyyy')}</TableCell>
                            <TableCell className="text-xs">{format(new Date(r.returned_at), 'HH:mm')}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reasons summary */}
          <TabsContent value="reasons">
            <Card>
              <CardContent className="p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Returns</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {REASON_OPTIONS.map(opt => {
                      const subset = filteredReturns.filter(r => r.reason === opt.value);
                      const amount = subset.reduce((s, r) => s + Number(r.return_amount || 0), 0);
                      const pct = totals.returnAmt > 0 ? (amount / totals.returnAmt) * 100 : 0;
                      return (
                        <TableRow key={opt.value}>
                          <TableCell className="font-medium">{opt.label}</TableCell>
                          <TableCell className="text-right">{subset.length}</TableCell>
                          <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                          <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Charts */}
          <TabsContent value="charts">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">Return Trend</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="amount" stroke="#1e3a8a" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">Top Returned Products</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topProducts} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="qty" fill="#7c3aed" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">Top Return Reasons</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={reasonBreakdown} dataKey="value" nameKey="name" outerRadius={90} label>
                          {reasonBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">Refund Analysis (by Method)</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={refundAnalysis}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="method" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="amount" fill="#0891b2" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SalesReturnReportPage;
