import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears, differenceInDays } from 'date-fns';
import { ArrowLeft, Download, Printer, FileSpreadsheet, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

import { useLocale } from '@/contexts/LocaleContext';
import { useOwnerStore } from '@/hooks/useOwnerStore';
import { usePOS } from '@/contexts/POSContext';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV, exportToPrintableHTML, formatCurrency as fmtCurrencyExport, type ExportColumn } from '@/lib/reportExportUtils';
import { toast } from 'sonner';

// ----- Types -----
type Granularity = 'date' | 'today_yesterday' | 'week' | 'month' | 'year' | 'custom';
type Dimension = 'overall' | 'product' | 'category' | 'customer' | 'salesperson' | 'store';

interface PeriodRange { start: Date; end: Date; label: string; }
interface Metrics {
  grossSales: number;
  netSales: number;
  revenue: number;
  profit: number;
  bills: number;
  orders: number;
  itemsSold: number;
  avgBillValue: number;
  discount: number;
  tax: number;
  returns: number;
  cancelledOrders: number;
  refundAmount: number;
  profitMargin: number;
}

const EMPTY_METRICS: Metrics = {
  grossSales: 0, netSales: 0, revenue: 0, profit: 0, bills: 0, orders: 0, itemsSold: 0,
  avgBillValue: 0, discount: 0, tax: 0, returns: 0, cancelledOrders: 0, refundAmount: 0, profitMargin: 0,
};

// ----- Helpers -----
const getStoreIdFromStorage = (): string | null => {
  try {
    const storeData = localStorage.getItem('pos_active_store_data');
    if (storeData) { const p = JSON.parse(storeData); if (p?.id) return p.id; }
  } catch {}
  const active = localStorage.getItem('pos_active_store');
  if (active) { try { return JSON.parse(active); } catch {} }
  return null;
};

const computeMetrics = (rows: any[]): Metrics => {
  const m: Metrics = { ...EMPTY_METRICS };
  for (const r of rows) {
    const total = Number(r.total) || 0;
    const subtotal = Number(r.subtotal) || 0;
    const tax = Number(r.tax) || 0;
    const discount = Number(r.discount) || 0;
    const isCancelled = r.status === 'cancelled';
    const items = Array.isArray(r.items) ? r.items : [];
    const qty = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);

    if (isCancelled) {
      m.cancelledOrders += 1;
      m.refundAmount += total;
      continue;
    }

    m.grossSales += subtotal + tax;
    m.netSales += total;
    m.revenue += total;
    m.discount += discount;
    m.tax += tax;
    m.bills += 1;
    m.orders += 1;
    m.itemsSold += qty;
  }
  m.profit = Math.max(0, m.netSales - m.discount); // proxy; no COGS column
  m.avgBillValue = m.bills > 0 ? m.netSales / m.bills : 0;
  m.profitMargin = m.netSales > 0 ? (m.profit / m.netSales) * 100 : 0;
  return m;
};

const presetRange = (preset: Granularity): { a: PeriodRange; b: PeriodRange } | null => {
  const today = new Date();
  switch (preset) {
    case 'today_yesterday': {
      const a = { start: startOfDay(today), end: endOfDay(today), label: 'Today' };
      const y = subDays(today, 1);
      const b = { start: startOfDay(y), end: endOfDay(y), label: 'Yesterday' };
      return { a, b };
    }
    case 'week': {
      const a = { start: startOfWeek(today), end: endOfWeek(today), label: 'This Week' };
      const lw = subWeeks(today, 1);
      const b = { start: startOfWeek(lw), end: endOfWeek(lw), label: 'Last Week' };
      return { a, b };
    }
    case 'month': {
      const a = { start: startOfMonth(today), end: endOfMonth(today), label: 'This Month' };
      const lm = subMonths(today, 1);
      const b = { start: startOfMonth(lm), end: endOfMonth(lm), label: 'Last Month' };
      return { a, b };
    }
    case 'year': {
      const a = { start: startOfYear(today), end: endOfYear(today), label: 'This Year' };
      const ly = subYears(today, 1);
      const b = { start: startOfYear(ly), end: endOfYear(ly), label: 'Last Year' };
      return { a, b };
    }
    default:
      return null;
  }
};

const growth = (a: number, b: number): number | null => {
  if (b === 0 && a === 0) return null;        // no data either side → N/A
  if (b === 0) return null;                    // can't divide by zero → N/A (avoid fake +100%)
  return ((a - b) / Math.abs(b)) * 100;
};

const fmtPct = (n: number | null) => n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

// ----- Component -----
const SalesComparisonPage: React.FC = () => {
  const navigate = useNavigate();
  const { formatCurrency } = useLocale();
  const { isOwner, selectedStoreId, selectedStoreName } = useOwnerStore();
  const pos = usePOS();
  const stores = pos?.stores || [];

  const [granularity, setGranularity] = useState<Granularity>('today_yesterday');
  const [dimension, setDimension] = useState<Dimension>('overall');
  const [rangeA, setRangeA] = useState<PeriodRange>(() => presetRange('today_yesterday')!.a);
  const [rangeB, setRangeB] = useState<PeriodRange>(() => presetRange('today_yesterday')!.b);
  const [storeFilter, setStoreFilter] = useState<string>('current'); // owner-only: 'current' | storeId | 'all'

  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all');

  const [loading, setLoading] = useState(false);
  const [ordersA, setOrdersA] = useState<any[]>([]);
  const [ordersB, setOrdersB] = useState<any[]>([]);

  // RBAC-enforced effective store ID
  const effectiveStoreId = useMemo(() => {
    if (!isOwner) return getStoreIdFromStorage(); // Store users locked to their store
    if (storeFilter === 'all') return null;
    if (storeFilter === 'current') return selectedStoreId || getStoreIdFromStorage();
    return storeFilter;
  }, [isOwner, storeFilter, selectedStoreId]);

  // Update ranges when granularity preset changes
  useEffect(() => {
    const p = presetRange(granularity);
    if (p) { setRangeA(p.a); setRangeB(p.b); }
  }, [granularity]);

  const fetchPeriod = useCallback(async (range: PeriodRange) => {
    let q = supabase.from('orders').select('*')
      .gte('created_at', range.start.toISOString())
      .lte('created_at', range.end.toISOString())
      .limit(10000);

    // RBAC: store users always scoped; owner respects filter
    if (effectiveStoreId) q = q.eq('store_id', effectiveStoreId);

    if (paymentFilter !== 'all') q = q.eq('payment_method', paymentFilter);
    if (orderTypeFilter !== 'all') q = q.eq('order_type', orderTypeFilter);

    const { data, error } = await q;
    if (error) {
      console.error('[SalesComparison] fetch error:', error);
      return [];
    }
    return data || [];
  }, [effectiveStoreId, paymentFilter, orderTypeFilter]);

  const runComparison = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([fetchPeriod(rangeA), fetchPeriod(rangeB)]);
      setOrdersA(a);
      setOrdersB(b);
    } catch (e) {
      toast.error('Failed to load comparison');
    } finally {
      setLoading(false);
    }
  }, [fetchPeriod, rangeA, rangeB]);

  useEffect(() => { runComparison(); }, [runComparison]);

  const metricsA = useMemo(() => computeMetrics(ordersA), [ordersA]);
  const metricsB = useMemo(() => computeMetrics(ordersB), [ordersB]);

  // Dimension breakdown (top performers) — by product
  const breakdown = useMemo(() => {
    const aggregate = (rows: any[]) => {
      const map = new Map<string, { name: string; revenue: number; qty: number; }>();
      for (const r of rows) {
        if (r.status === 'cancelled') continue;
        const items = Array.isArray(r.items) ? r.items : [];
        for (const it of items) {
          let key = '';
          let name = '';
          switch (dimension) {
            case 'product':
              key = String(it.id || it.name || 'unknown');
              name = it.name || 'Unknown';
              break;
            case 'category':
              key = String(it.category || 'Uncategorized');
              name = it.category || 'Uncategorized';
              break;
            case 'customer':
              key = String(r.customer_phone || r.customer_name || 'Walk-in');
              name = r.customer_name || r.customer_phone || 'Walk-in';
              break;
            case 'salesperson':
              key = String(r.cashier_name || r.staff_name || 'N/A');
              name = r.cashier_name || r.staff_name || 'N/A';
              break;
            case 'store':
              key = String(r.store_id || 'unknown');
              name = stores.find(s => s.id === r.store_id)?.name || (r.store_id ? r.store_id.slice(0, 8) : 'Unknown');
              break;
            default:
              return new Map();
          }
          if (!map.has(key)) map.set(key, { name, revenue: 0, qty: 0 });
          const entry = map.get(key)!;
          const lineTotal = (Number(it.price) || 0) * (Number(it.quantity) || 0);
          entry.revenue += lineTotal;
          entry.qty += Number(it.quantity) || 0;
        }
      }
      return map;
    };

    if (dimension === 'overall') return [];
    const a = aggregate(ordersA);
    const b = aggregate(ordersB);
    const keys = new Set([...a.keys(), ...b.keys()]);
    const rows = Array.from(keys).map(k => {
      const ra = a.get(k); const rb = b.get(k);
      const name = ra?.name || rb?.name || k;
      const revA = ra?.revenue || 0; const revB = rb?.revenue || 0;
      return {
        key: k, name,
        revenueA: revA, revenueB: revB,
        qtyA: ra?.qty || 0, qtyB: rb?.qty || 0,
        diff: revA - revB,
        growth: growth(revA, revB),
      };
    });
    rows.sort((x, y) => y.revenueA - x.revenueA);
    return rows;
  }, [dimension, ordersA, ordersB, stores]);

  const topPerformers = breakdown.filter(r => (r.growth ?? 0) > 0).slice(0, 5);
  const bottomPerformers = [...breakdown].sort((a, b) => (a.growth ?? 0) - (b.growth ?? 0)).slice(0, 5);

  // Charts data
  const chartData = useMemo(() => ([
    { metric: 'Gross', A: metricsA.grossSales, B: metricsB.grossSales },
    { metric: 'Net', A: metricsA.netSales, B: metricsB.netSales },
    { metric: 'Profit', A: metricsA.profit, B: metricsB.profit },
    { metric: 'Discount', A: metricsA.discount, B: metricsB.discount },
    { metric: 'Tax', A: metricsA.tax, B: metricsB.tax },
  ]), [metricsA, metricsB]);

  // Daily trend
  const trendData = useMemo(() => {
    const bucket = (rows: any[], range: PeriodRange) => {
      const days = Math.max(1, differenceInDays(range.end, range.start) + 1);
      const arr: { day: number; value: number }[] = Array.from({ length: days }, (_, i) => ({ day: i + 1, value: 0 }));
      for (const r of rows) {
        if (r.status === 'cancelled') continue;
        const dayIdx = differenceInDays(new Date(r.created_at), range.start);
        if (dayIdx >= 0 && dayIdx < days) arr[dayIdx].value += Number(r.total) || 0;
      }
      return arr;
    };
    const a = bucket(ordersA, rangeA);
    const b = bucket(ordersB, rangeB);
    const len = Math.max(a.length, b.length);
    return Array.from({ length: len }, (_, i) => ({
      day: `Day ${i + 1}`,
      [rangeA.label]: a[i]?.value || 0,
      [rangeB.label]: b[i]?.value || 0,
    }));
  }, [ordersA, ordersB, rangeA, rangeB]);

  // Metric rows for table & export
  const metricRows = useMemo(() => {
    const rows: { metric: string; a: number; b: number; isCurrency: boolean }[] = [
      { metric: 'Gross Sales', a: metricsA.grossSales, b: metricsB.grossSales, isCurrency: true },
      { metric: 'Net Sales', a: metricsA.netSales, b: metricsB.netSales, isCurrency: true },
      { metric: 'Revenue', a: metricsA.revenue, b: metricsB.revenue, isCurrency: true },
      { metric: 'Profit', a: metricsA.profit, b: metricsB.profit, isCurrency: true },
      { metric: 'Bills', a: metricsA.bills, b: metricsB.bills, isCurrency: false },
      { metric: 'Orders', a: metricsA.orders, b: metricsB.orders, isCurrency: false },
      { metric: 'Items Sold', a: metricsA.itemsSold, b: metricsB.itemsSold, isCurrency: false },
      { metric: 'Avg Bill Value', a: metricsA.avgBillValue, b: metricsB.avgBillValue, isCurrency: true },
      { metric: 'Discount', a: metricsA.discount, b: metricsB.discount, isCurrency: true },
      { metric: 'Tax', a: metricsA.tax, b: metricsB.tax, isCurrency: true },
      { metric: 'Cancelled Orders', a: metricsA.cancelledOrders, b: metricsB.cancelledOrders, isCurrency: false },
      { metric: 'Refund Amount', a: metricsA.refundAmount, b: metricsB.refundAmount, isCurrency: true },
      { metric: 'Profit Margin %', a: metricsA.profitMargin, b: metricsB.profitMargin, isCurrency: false },
    ];
    return rows.map(r => ({ ...r, diff: r.a - r.b, growth: growth(r.a, r.b) }));
  }, [metricsA, metricsB]);

  // Export
  const fileBase = `sales-comparison_${format(rangeA.start, 'yyyyMMdd')}-vs-${format(rangeB.start, 'yyyyMMdd')}`;
  const exportColumns: ExportColumn[] = [
    { key: 'metric', header: 'Metric' },
    { key: 'a', header: rangeA.label, format: (v) => (typeof v === 'number' ? v.toFixed(2) : v) },
    { key: 'b', header: rangeB.label, format: (v) => (typeof v === 'number' ? v.toFixed(2) : v) },
    { key: 'diff', header: 'Difference', format: (v) => (typeof v === 'number' ? v.toFixed(2) : v) },
    { key: 'growth', header: 'Growth %', format: (v) => v === null || v === undefined ? '—' : fmtPct(Number(v)) },
  ];

  const handleCSV = () => exportToCSV(metricRows as any, exportColumns, fileBase);
  const handlePrint = () => exportToPrintableHTML(metricRows as any, exportColumns, 'Sales Comparison Report', {
    storeName: selectedStoreName,
    dateRange: `${rangeA.label} vs ${rangeB.label}`,
  });

  const TrendIcon = ({ value }: { value: number }) =>
    value > 0 ? <TrendingUp className="h-4 w-4 text-green-600" />
    : value < 0 ? <TrendingDown className="h-4 w-4 text-red-600" />
    : <Minus className="h-4 w-4 text-muted-foreground" />;

  // RBAC-filtered dimension options
  const dimensionOptions: { value: Dimension; label: string }[] = [
    { value: 'overall', label: 'Overall' },
    { value: 'product', label: 'Product' },
    { value: 'category', label: 'Category' },
    { value: 'customer', label: 'Customer' },
    { value: 'salesperson', label: 'Salesperson' },
    ...(isOwner ? [{ value: 'store' as const, label: 'Store / Outlet' }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/reports')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Sales Comparison</h1>
              <p className="text-xs text-muted-foreground">
                {isOwner ? `Company / Store view — ${selectedStoreName}` : 'Store-level comparison'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCSV}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print / PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto space-y-4 p-4">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Comparison Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Comparison Preset</label>
                <Select value={granularity} onValueChange={(v: Granularity) => setGranularity(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today_yesterday">Today vs Yesterday</SelectItem>
                    <SelectItem value="week">This Week vs Last Week</SelectItem>
                    <SelectItem value="month">This Month vs Last Month</SelectItem>
                    <SelectItem value="year">This Year vs Last Year</SelectItem>
                    <SelectItem value="custom">Custom Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Compare By</label>
                <Select value={dimension} onValueChange={(v: Dimension) => setDimension(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dimensionOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Owner-only store filter */}
              {isOwner && (
                <div>
                  <label className="mb-1 block text-xs font-medium">Outlet / Store</label>
                  <Select value={storeFilter} onValueChange={setStoreFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current ({selectedStoreName})</SelectItem>
                      <SelectItem value="all">All Stores (Company-wide)</SelectItem>
                      {stores.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {granularity === 'custom' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Period A (single date ya range — dono allowed)</label>
                  <DatePickerWithRange
                    date={{ from: rangeA.start, to: rangeA.end }}
                    setDate={(d) => {
                      if (!d?.from) return;
                      const from = d.from;
                      const to = d.to ?? d.from; // single date → same day range
                      const sameDay = from.toDateString() === to.toDateString();
                      setRangeA({
                        start: startOfDay(from),
                        end: endOfDay(to),
                        label: sameDay ? format(from, 'dd MMM yyyy') : `${format(from, 'dd MMM')} – ${format(to, 'dd MMM')}`,
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Period B (single date ya range — dono allowed)</label>
                  <DatePickerWithRange
                    date={{ from: rangeB.start, to: rangeB.end }}
                    setDate={(d) => {
                      if (!d?.from) return;
                      const from = d.from;
                      const to = d.to ?? d.from;
                      const sameDay = from.toDateString() === to.toDateString();
                      setRangeB({
                        start: startOfDay(from),
                        end: endOfDay(to),
                        label: sameDay ? format(from, 'dd MMM yyyy') : `${format(from, 'dd MMM')} – ${format(to, 'dd MMM')}`,
                      });
                    }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Payment Method</label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="part">Split / Part</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Order Type</label>
                <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="dine-in">Dine-in</SelectItem>
                    <SelectItem value="takeaway">Takeaway</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="qr">QR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">A</Badge>
                <span>{rangeA.label} <span className="text-muted-foreground">({ordersA.length} rows)</span></span>
                <span className="mx-1 text-muted-foreground">vs</span>
                <Badge variant="outline">B</Badge>
                <span>{rangeB.label} <span className="text-muted-foreground">({ordersB.length} rows)</span></span>
              </div>
              <Button size="sm" onClick={runComparison} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </Button>
            </div>
            {(ordersA.length === 0 || ordersB.length === 0) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {ordersA.length === 0 && ordersB.length === 0
                  ? 'Both periods have no orders for the selected filters.'
                  : ordersA.length === 0
                    ? `Period A (${rangeA.label}) has no orders — growth % will show "—".`
                    : `Period B (${rangeB.label}) has no orders — growth % will show "—" (cannot divide by zero).`}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metricRows.slice(0, 8).map(row => (
            <Card key={row.metric}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{row.metric}</div>
                <div className="mt-1 text-lg font-bold">
                  {row.isCurrency ? formatCurrency(row.a) : row.a.toLocaleString()}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs">
                  <TrendIcon value={row.growth ?? 0} />
                  <span className={(row.growth ?? 0) > 0 ? 'text-green-600' : (row.growth ?? 0) < 0 ? 'text-red-600' : 'text-muted-foreground'}>
                    {fmtPct(row.growth)}
                  </span>
                  <span className="text-muted-foreground">
                    vs {row.isCurrency ? formatCurrency(row.b) : row.b.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Metric Comparison</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="metric" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="A" name={rangeA.label} fill="hsl(var(--primary))" />
                  <Bar dataKey="B" name={rangeB.label} fill="hsl(var(--muted-foreground))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Daily Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey={rangeA.label} stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey={rangeB.label} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Detailed metrics table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">All Metrics</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">Metric</th>
                  <th className="py-2 text-right">{rangeA.label}</th>
                  <th className="py-2 text-right">{rangeB.label}</th>
                  <th className="py-2 text-right">Difference</th>
                  <th className="py-2 text-right">Growth</th>
                </tr>
              </thead>
              <tbody>
                {metricRows.map(r => (
                  <tr key={r.metric} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.metric}</td>
                    <td className="py-2 text-right">{r.isCurrency ? formatCurrency(r.a) : r.a.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="py-2 text-right">{r.isCurrency ? formatCurrency(r.b) : r.b.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={`py-2 text-right ${r.diff > 0 ? 'text-green-600' : r.diff < 0 ? 'text-red-600' : ''}`}>
                      {r.isCurrency ? formatCurrency(r.diff) : r.diff.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className={`py-2 text-right ${(r.growth ?? 0) > 0 ? 'text-green-600' : (r.growth ?? 0) < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {fmtPct(r.growth)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Top / Bottom performers */}
        {dimension !== 'overall' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-600" /> Top Performers</CardTitle></CardHeader>
              <CardContent>
                {topPerformers.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No growth winners in this range</div>
                ) : (
                  <ul className="space-y-2">
                    {topPerformers.map(r => (
                      <li key={r.key} className="flex items-center justify-between text-sm">
                        <span className="truncate">{r.name}</span>
                        <span className="flex items-center gap-2">
                          <span>{formatCurrency(r.revenueA)}</span>
                          <Badge variant="default" className="bg-green-600 hover:bg-green-600">{fmtPct(r.growth)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> Bottom Performers</CardTitle></CardHeader>
              <CardContent>
                {bottomPerformers.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No data</div>
                ) : (
                  <ul className="space-y-2">
                    {bottomPerformers.map(r => (
                      <li key={r.key} className="flex items-center justify-between text-sm">
                        <span className="truncate">{r.name}</span>
                        <span className="flex items-center gap-2">
                          <span>{formatCurrency(r.revenueA)}</span>
                          <Badge variant="destructive">{fmtPct(r.growth)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {!isOwner && (
          <p className="text-center text-xs text-muted-foreground">
            <BarChart3 className="mr-1 inline h-3 w-3" />
            Showing data for your store only. Multi-outlet & company-wide views are restricted.
          </p>
        )}
      </div>
    </div>
  );
};

export default SalesComparisonPage;
