import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DateRange } from 'react-day-picker';
import { TrendingUp, DollarSign, AlertTriangle, BarChart3, Clock } from 'lucide-react';
import { format } from 'date-fns';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from 'recharts';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useLocale } from '@/contexts/LocaleContext';
import { useReportScope } from '@/lib/reports/scope';
import { Preset, presetToRange, previousPeriod, formatRangeLabel } from '@/lib/reports/timeRanges';
import { ReportShell } from '@/components/reports/ReportShell';
import { KpiCard } from '@/components/reports/KpiCard';
import { SortableTable } from '@/components/reports/SortableTable';
import { ReportPayload } from '@/lib/reports/exporters';

const CHART_COLORS = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#06b6d4', '#ec4899', '#84cc16'];

type FocusKey = 'overview' | 'gross' | 'net' | 'revenue' | 'tax' | 'discount' | 'aov' | 'profit' | 'top' | 'hourly';

const SalesSummaryPage: React.FC = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { formatCurrency } = useLocale();
  const scope = useReportScope();

  const [preset, setPreset] = useState<Preset>('today');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [searchText, setSearchText] = useState('');
  const focusParam = (search.get('focus') as FocusKey | null) || 'overview';
  const [tab, setTab] = useState<FocusKey>(focusParam);
  useEffect(() => { setTab((search.get('focus') as FocusKey) || 'overview'); }, [search]);

  const activeRange = presetToRange(preset, customRange);
  const prevRange = previousPeriod(activeRange);

  const { summary, paymentSummary, orderTypeSummary, discountSummary, filteredOrders, hourlySales, itemSummary, categorySummary } =
    useAnalytics('custom', activeRange);
  const prev = useAnalytics('custom', prevRange);

  // ===== Derived metrics =====
  const metrics = useMemo(() => {
    const completed = filteredOrders;
    const subtotal = completed.reduce((s, o) => s + (o.subtotal || 0), 0);
    const discount = completed.reduce((s, o) => s + (o.discount || 0), 0);
    const tax = completed.reduce((s, o) => s + (o.tax || 0), 0);
    const total = completed.reduce((s, o) => s + (o.total || 0), 0);
    const itemsSold = completed.reduce((s, o) => s + (Array.isArray(o.items) ? o.items.reduce((a, i: any) => a + (i.quantity || 1), 0) : 0), 0);
    const refunds = completed.filter((o: any) => o.refundAmount).reduce((s, o: any) => s + (o.refundAmount || 0), 0);
    const returns = completed.filter((o: any) => o.returnAmount).reduce((s, o: any) => s + (o.returnAmount || 0), 0);
    const cogs = completed.reduce((s, o) => {
      if (!Array.isArray(o.items)) return s;
      return s + o.items.reduce((a, it: any) => a + ((it.cost || 0) * (it.quantity || 1)), 0);
    }, 0);
    const grossSales = subtotal; // pre-discount, pre-tax
    const netSales = subtotal - discount; // pre-tax revenue
    const revenue = total; // collected
    const grossProfit = grossSales - cogs;
    const netProfit = netSales - cogs - refunds - returns;
    const billCount = completed.length;
    const aov = billCount > 0 ? total / billCount : 0;
    const avgItemsPerBill = billCount > 0 ? itemsSold / billCount : 0;
    const bills = completed.map(o => o.total || 0);
    const highest = bills.length ? Math.max(...bills) : 0;
    const lowest = bills.length ? Math.min(...bills) : 0;
    const grossMarginPct = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;
    const netMarginPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;
    return {
      grossSales, netSales, revenue, discount, tax, refunds, returns, cogs,
      grossProfit, netProfit, grossMarginPct, netMarginPct, itemsSold,
      billCount, aov, avgItemsPerBill, highest, lowest,
    };
  }, [filteredOrders]);

  const prevMetrics = useMemo(() => {
    const c = prev.filteredOrders;
    const total = c.reduce((s, o) => s + (o.total || 0), 0);
    const sub = c.reduce((s, o) => s + (o.subtotal || 0), 0);
    const disc = c.reduce((s, o) => s + (o.discount || 0), 0);
    return { revenue: total, grossSales: sub, netSales: sub - disc, billCount: c.length };
  }, [prev.filteredOrders]);

  const growth = (cur: number, p: number) => p === 0 ? (cur > 0 ? 100 : 0) : ((cur - p) / p) * 100;

  // ===== Trend series =====
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { date: string; gross: number; net: number; revenue: number; bills: number; profit: number }>();
    filteredOrders.forEach(o => {
      const key = format(new Date(o.createdAt), 'dd MMM');
      const cur = map.get(key) || { date: key, gross: 0, net: 0, revenue: 0, bills: 0, profit: 0 };
      const sub = o.subtotal || 0; const disc = o.discount || 0;
      cur.gross += sub; cur.net += sub - disc; cur.revenue += o.total || 0; cur.bills += 1;
      const cogs = Array.isArray(o.items) ? o.items.reduce((a, i: any) => a + (i.cost || 0) * (i.quantity || 1), 0) : 0;
      cur.profit += (sub - disc) - cogs;
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [filteredOrders]);

  // ===== Payment breakdown (with %) =====
  const paymentRows = useMemo(() =>
    paymentSummary.map(p => ({ method: p.method, count: p.count, amount: p.amount, pct: p.percentage })),
  [paymentSummary]);

  // ===== Top customers =====
  const topCustomers = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; bills: number; spent: number }>();
    filteredOrders.forEach(o => {
      const phone = o.customerPhone || '';
      const name = o.customerName || 'Walk-in';
      if (!phone && name === 'Walk-in') return;
      const k = phone || name;
      const cur = m.get(k) || { name, phone, bills: 0, spent: 0 };
      cur.bills += 1; cur.spent += o.total || 0;
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.spent - a.spent).slice(0, 50);
  }, [filteredOrders]);

  // ===== Tax breakdown =====
  const taxBreakdown = useMemo(() => {
    const cgst = metrics.tax / 2;
    const sgst = metrics.tax / 2;
    const igst = 0;
    const cess = 0;
    const byCategory = new Map<string, number>();
    filteredOrders.forEach(o => {
      if (!Array.isArray(o.items)) return;
      const orderSubtotal = o.subtotal || 1;
      const taxShare = (o.tax || 0);
      o.items.forEach((i: any) => {
        const cat = i.category || 'Uncategorized';
        const share = ((i.price || 0) * (i.quantity || 1)) / orderSubtotal;
        byCategory.set(cat, (byCategory.get(cat) || 0) + taxShare * share);
      });
    });
    return { cgst, sgst, igst, cess, byCategory: Array.from(byCategory.entries()).map(([cat, tax]) => ({ category: cat, tax })) };
  }, [filteredOrders, metrics.tax]);

  // ===== Discount breakdown =====
  const discountBreakdown = useMemo(() => {
    let manual = 0, offer = 0, coupon = 0, employee = 0;
    filteredOrders.forEach((o: any) => {
      const d = o.discount || 0;
      const type = (o.discountType || 'manual').toLowerCase();
      if (type === 'offer') offer += d;
      else if (type === 'coupon') coupon += d;
      else if (type === 'employee') employee += d;
      else manual += d;
    });
    const pct = metrics.grossSales > 0 ? (metrics.discount / metrics.grossSales) * 100 : 0;
    return { manual, offer, coupon, employee, pct };
  }, [filteredOrders, metrics]);

  // ===== Hourly =====
  const hourlyRows = useMemo(() => hourlySales.map(h => ({ hour: h.hour, bills: h.orders, revenue: h.amount })), [hourlySales]);
  const peakHour = useMemo(() => [...hourlyRows].sort((a, b) => b.bills - a.bills)[0], [hourlyRows]);

  // ===== Export payload =====
  const buildPayload = (): ReportPayload => ({
    title: `Sales Summary — ${tab.toUpperCase()}`,
    subtitle: scope.storeName,
    dateRange: formatRangeLabel(activeRange),
    storeName: scope.storeName,
    kpis: [
      { label: 'Gross Sales', value: formatCurrency(metrics.grossSales) },
      { label: 'Net Sales', value: formatCurrency(metrics.netSales) },
      { label: 'Revenue', value: formatCurrency(metrics.revenue) },
      { label: 'Bills', value: metrics.billCount },
      { label: 'Items Sold', value: metrics.itemsSold },
      { label: 'AOV', value: formatCurrency(Math.round(metrics.aov)) },
      { label: 'Discount', value: formatCurrency(metrics.discount) },
      { label: 'Tax', value: formatCurrency(metrics.tax) },
      { label: 'Gross Profit', value: formatCurrency(metrics.grossProfit) },
      { label: 'Net Profit', value: formatCurrency(metrics.netProfit) },
      { label: 'Gross Margin %', value: `${metrics.grossMarginPct.toFixed(1)}%` },
      { label: 'Net Margin %', value: `${metrics.netMarginPct.toFixed(1)}%` },
    ],
    sections: [
      { title: 'Daily Trend', headers: ['Date', 'Bills', 'Gross', 'Net', 'Revenue', 'Profit'],
        rows: dailyTrend.map(d => [d.date, d.bills, d.gross.toFixed(2), d.net.toFixed(2), d.revenue.toFixed(2), d.profit.toFixed(2)]) },
      { title: 'Payment Methods', headers: ['Method', 'Bills', 'Amount', '%'],
        rows: paymentRows.map(p => [p.method, p.count, p.amount.toFixed(2), `${p.pct.toFixed(1)}%`]) },
      { title: 'Top Products', headers: ['Item', 'Category', 'Qty', 'Revenue'],
        rows: itemSummary.slice(0, 50).map(i => [i.name, i.category, i.qty, i.amount.toFixed(2)]) },
      { title: 'Top Categories', headers: ['Category', 'Items', 'Qty', 'Amount'],
        rows: categorySummary.map(c => [c.name, c.itemCount, c.totalQty, c.totalAmount.toFixed(2)]) },
      { title: 'Top Customers', headers: ['Name', 'Phone', 'Bills', 'Spent'],
        rows: topCustomers.map(c => [c.name, c.phone || '-', c.bills, c.spent.toFixed(2)]) },
      { title: 'Hourly Sales', headers: ['Hour', 'Bills', 'Revenue'],
        rows: hourlyRows.map(h => [h.hour, h.bills, h.revenue.toFixed(2)]) },
      { title: 'Tax Breakdown', headers: ['Component', 'Amount'],
        rows: [['CGST', taxBreakdown.cgst.toFixed(2)], ['SGST', taxBreakdown.sgst.toFixed(2)], ['IGST', taxBreakdown.igst.toFixed(2)], ['CESS', taxBreakdown.cess.toFixed(2)], ['Total Tax', metrics.tax.toFixed(2)]] },
      { title: 'Discount Breakdown', headers: ['Type', 'Amount'],
        rows: [['Manual', discountBreakdown.manual.toFixed(2)], ['Offer', discountBreakdown.offer.toFixed(2)], ['Coupon', discountBreakdown.coupon.toFixed(2)], ['Employee', discountBreakdown.employee.toFixed(2)], ['Total', metrics.discount.toFixed(2)]] },
    ],
  });

  const fmt = (n: number) => formatCurrency(Math.round(n));
  const setFocus = (k: FocusKey) => { setTab(k); navigate(`/reports/sales?focus=${k}`, { replace: true }); };

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Sales Summary"
        subtitle="Enterprise sales overview"
        icon={<TrendingUp className="h-5 w-5 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={searchText} setSearch={setSearchText}
        buildPayload={buildPayload}
      />

      <div className="p-4 space-y-4">
        {/* KPI grid (clickable drill-downs) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
          <KpiCard label="Gross Sales" value={fmt(metrics.grossSales)} tone="primary" onClick={() => setFocus('gross')}
            hint={`${growth(metrics.grossSales, prevMetrics.grossSales) >= 0 ? '+' : ''}${growth(metrics.grossSales, prevMetrics.grossSales).toFixed(1)}% vs prev`} />
          <KpiCard label="Net Sales" value={fmt(metrics.netSales)} tone="success" onClick={() => setFocus('net')}
            hint={`${growth(metrics.netSales, prevMetrics.netSales) >= 0 ? '+' : ''}${growth(metrics.netSales, prevMetrics.netSales).toFixed(1)}% vs prev`} />
          <KpiCard label="Revenue" value={fmt(metrics.revenue)} tone="primary" onClick={() => setFocus('revenue')}
            hint={`${growth(metrics.revenue, prevMetrics.revenue) >= 0 ? '+' : ''}${growth(metrics.revenue, prevMetrics.revenue).toFixed(1)}% vs prev`} />
          <KpiCard label="Bills" value={metrics.billCount} onClick={() => setFocus('overview')} />
          <KpiCard label="Items Sold" value={metrics.itemsSold} onClick={() => setFocus('top')} />
          <KpiCard label="AOV" value={fmt(metrics.aov)} onClick={() => setFocus('aov')} hint={`${metrics.avgItemsPerBill.toFixed(1)} items/bill`} />
          <KpiCard label="Discount" value={fmt(metrics.discount)} tone="warning" onClick={() => setFocus('discount')} hint={`${discountBreakdown.pct.toFixed(1)}% of gross`} />
          <KpiCard label="Tax" value={fmt(metrics.tax)} onClick={() => setFocus('tax')} />
          <KpiCard label="Refunds" value={fmt(metrics.refunds)} tone="destructive" />
          <KpiCard label="Returns" value={fmt(metrics.returns)} tone="destructive" />
          <KpiCard label="Gross Profit" value={fmt(metrics.grossProfit)} tone="success" onClick={() => setFocus('profit')} hint={`${metrics.grossMarginPct.toFixed(1)}% margin`} />
          <KpiCard label="Net Profit" value={fmt(metrics.netProfit)} tone="success" onClick={() => setFocus('profit')} hint={`${metrics.netMarginPct.toFixed(1)}% margin`} />
        </div>

        <Tabs value={tab} onValueChange={(v) => setFocus(v as FocusKey)}>
          <TabsList className="flex flex-wrap h-auto justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="gross">Gross Sales</TabsTrigger>
            <TabsTrigger value="net">Net Sales</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="tax">Tax</TabsTrigger>
            <TabsTrigger value="discount">Discount</TabsTrigger>
            <TabsTrigger value="aov">AOV</TabsTrigger>
            <TabsTrigger value="profit">Profit</TabsTrigger>
            <TabsTrigger value="top">Top Products / Customers</TabsTrigger>
            <TabsTrigger value="hourly">Hourly / Daily</TabsTrigger>
          </TabsList>

          {/* ===== OVERVIEW ===== */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Daily Trend — Gross vs Net vs Revenue</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="gross" name="Gross" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="net" name="Net" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Payment Mix</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={paymentRows.filter(p => Number(p.amount) > 0)}
                        dataKey="amount"
                        nameKey="method"
                        outerRadius={85}
                        innerRadius={40}
                        paddingAngle={1}
                        minAngle={3}
                        labelLine={false}
                        label={(e: any) => (e.pct >= 6 ? `${e.pct.toFixed(0)}%` : '')}
                      >
                        {paymentRows.filter(p => Number(p.amount) > 0).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any, n: any) => [fmt(Number(v)), n]} />
                      <Legend verticalAlign="bottom" height={36} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Order Type Mix</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={orderTypeSummary}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                      <Bar dataKey="amount" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== GROSS SALES ===== */}
          <TabsContent value="gross" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" />Gross Sales Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={dailyTrend}>
                    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.6} /><stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Area type="monotone" dataKey="gross" stroke={CHART_COLORS[0]} fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Gross Sales by Category</CardTitle></CardHeader>
                <CardContent>
                  <SortableTable
                    search={searchText}
                    data={categorySummary.map(c => ({ name: c.name, qty: c.totalQty, amount: c.totalAmount }))}
                    columns={[
                      { key: 'name', header: 'Category' },
                      { key: 'qty', header: 'Qty', numeric: true },
                      { key: 'amount', header: 'Amount', numeric: true, render: r => fmt(r.amount), sortAccessor: r => r.amount },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Gross Sales by Payment Method</CardTitle></CardHeader>
                <CardContent>
                  <SortableTable
                    search={searchText}
                    data={paymentRows}
                    columns={[
                      { key: 'method', header: 'Method' },
                      { key: 'count', header: 'Bills', numeric: true },
                      { key: 'amount', header: 'Amount', numeric: true, render: r => fmt(r.amount), sortAccessor: r => r.amount },
                      { key: 'pct', header: '%', numeric: true, render: r => `${r.pct.toFixed(1)}%`, sortAccessor: r => r.pct },
                    ]}
                  />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Gross Sales by Product</CardTitle></CardHeader>
              <CardContent>
                <SortableTable
                  search={searchText}
                  data={itemSummary}
                  columns={[
                    { key: 'name', header: 'Item' },
                    { key: 'category', header: 'Category' },
                    { key: 'qty', header: 'Qty', numeric: true },
                    { key: 'amount', header: 'Revenue', numeric: true, render: r => fmt(r.amount), sortAccessor: r => r.amount },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== NET SALES ===== */}
          <TabsContent value="net" className="space-y-4">
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Gross" value={fmt(metrics.grossSales)} tone="primary" />
              <KpiCard label="− Discount" value={fmt(metrics.discount)} tone="warning" />
              <KpiCard label="− Refunds / Returns" value={fmt(metrics.refunds + metrics.returns)} tone="destructive" />
              <KpiCard label="= Net Sales" value={fmt(metrics.netSales)} tone="success" />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Net Sales Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Line type="monotone" dataKey="net" stroke={CHART_COLORS[1]} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== REVENUE ===== */}
          <TabsContent value="revenue" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Revenue Trend & Growth</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  Growth vs previous period: <span className={growth(metrics.revenue, prevMetrics.revenue) >= 0 ? 'text-success' : 'text-destructive'}>
                    {growth(metrics.revenue, prevMetrics.revenue).toFixed(1)}%
                  </span> ({formatRangeLabel(prevRange)})
                </p>
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Revenue by Order Type</CardTitle></CardHeader>
                <CardContent>
                  <SortableTable data={orderTypeSummary}
                    columns={[
                      { key: 'type', header: 'Type' },
                      { key: 'count', header: 'Bills', numeric: true },
                      { key: 'amount', header: 'Revenue', numeric: true, render: r => fmt(r.amount), sortAccessor: r => r.amount },
                      { key: 'percentage', header: '%', numeric: true, render: r => `${r.percentage.toFixed(1)}%`, sortAccessor: r => r.percentage },
                    ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Revenue by Customer</CardTitle></CardHeader>
                <CardContent>
                  <SortableTable search={searchText} data={topCustomers}
                    columns={[
                      { key: 'name', header: 'Customer' },
                      { key: 'phone', header: 'Phone' },
                      { key: 'bills', header: 'Bills', numeric: true },
                      { key: 'spent', header: 'Revenue', numeric: true, render: r => fmt(r.spent), sortAccessor: r => r.spent },
                    ]} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== TAX ===== */}
          <TabsContent value="tax" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <KpiCard label="CGST" value={fmt(taxBreakdown.cgst)} />
              <KpiCard label="SGST" value={fmt(taxBreakdown.sgst)} />
              <KpiCard label="IGST" value={fmt(taxBreakdown.igst)} />
              <KpiCard label="CESS" value={fmt(taxBreakdown.cess)} />
              <KpiCard label="Total Tax" value={fmt(metrics.tax)} tone="primary" />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Tax Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyTrend.map(d => ({ date: d.date, tax: (d.net) * (metrics.grossSales > 0 ? metrics.tax / metrics.grossSales : 0) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Line type="monotone" dataKey="tax" stroke={CHART_COLORS[2]} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Tax by Category</CardTitle></CardHeader>
              <CardContent>
                <SortableTable search={searchText} data={taxBreakdown.byCategory}
                  columns={[
                    { key: 'category', header: 'Category' },
                    { key: 'tax', header: 'Tax', numeric: true, render: r => fmt(r.tax), sortAccessor: r => r.tax },
                  ]} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== DISCOUNT ===== */}
          <TabsContent value="discount" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <KpiCard label="Manual" value={fmt(discountBreakdown.manual)} />
              <KpiCard label="Offer" value={fmt(discountBreakdown.offer)} />
              <KpiCard label="Coupon" value={fmt(discountBreakdown.coupon)} />
              <KpiCard label="Employee" value={fmt(discountBreakdown.employee)} />
              <KpiCard label={`Total (${discountBreakdown.pct.toFixed(1)}%)`} value={fmt(metrics.discount)} tone="warning" />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Discount Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyTrend.map(d => ({ date: d.date, discount: d.gross - d.net }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Bar dataKey="discount" fill={CHART_COLORS[3]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== AOV ===== */}
          <TabsContent value="aov" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Average Bill" value={fmt(metrics.aov)} tone="primary" />
              <KpiCard label="Highest Bill" value={fmt(metrics.highest)} tone="success" />
              <KpiCard label="Lowest Bill" value={fmt(metrics.lowest)} />
              <KpiCard label="Avg Items / Bill" value={metrics.avgItemsPerBill.toFixed(1)} />
              <KpiCard label="Peak Hour" value={peakHour ? `${peakHour.hour} (${peakHour.bills} bills)` : '—'} />
              <KpiCard label="Avg Customer Spend"
                value={topCustomers.length ? fmt(topCustomers.reduce((s, c) => s + c.spent, 0) / topCustomers.length) : fmt(0)} />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">AOV Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={dailyTrend.map(d => ({ date: d.date, aov: d.bills > 0 ? d.revenue / d.bills : 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Line type="monotone" dataKey="aov" stroke={CHART_COLORS[4]} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== PROFIT ===== */}
          <TabsContent value="profit" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <KpiCard label="Gross Profit" value={fmt(metrics.grossProfit)} tone="success" />
              <KpiCard label="Net Profit" value={fmt(metrics.netProfit)} tone="success" />
              <KpiCard label="COGS" value={fmt(metrics.cogs)} />
              <KpiCard label="Gross Margin %" value={`${metrics.grossMarginPct.toFixed(1)}%`} tone="primary" />
              <KpiCard label="Net Margin %" value={`${metrics.netMarginPct.toFixed(1)}%`} tone="primary" />
              <KpiCard label="Refunds + Returns" value={fmt(metrics.refunds + metrics.returns)} tone="destructive" />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Profit Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke={CHART_COLORS[1]} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                {metrics.cogs === 0 && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> COGS = 0. Set cost on items to see accurate margins.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== TOP ===== */}
          <TabsContent value="top" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Top Selling Products</CardTitle></CardHeader>
                <CardContent>
                  <SortableTable search={searchText} data={itemSummary.slice(0, 50)}
                    columns={[
                      { key: 'name', header: 'Item' },
                      { key: 'qty', header: 'Qty', numeric: true },
                      { key: 'amount', header: 'Revenue', numeric: true, render: r => fmt(r.amount), sortAccessor: r => r.amount },
                    ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Top Categories</CardTitle></CardHeader>
                <CardContent>
                  <SortableTable search={searchText} data={categorySummary}
                    columns={[
                      { key: 'name', header: 'Category' },
                      { key: 'totalQty', header: 'Qty', numeric: true },
                      { key: 'totalAmount', header: 'Revenue', numeric: true, render: r => fmt(r.totalAmount), sortAccessor: r => r.totalAmount },
                    ]} />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Top Customers</CardTitle></CardHeader>
              <CardContent>
                <SortableTable search={searchText} data={topCustomers}
                  columns={[
                    { key: 'name', header: 'Customer' },
                    { key: 'phone', header: 'Phone' },
                    { key: 'bills', header: 'Bills', numeric: true },
                    { key: 'spent', header: 'Spent', numeric: true, render: r => fmt(r.spent), sortAccessor: r => r.spent },
                  ]} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== HOURLY ===== */}
          <TabsContent value="hourly" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Hourly Sales</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={hourlyRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Daily Sales</CardTitle></CardHeader>
              <CardContent>
                <SortableTable data={dailyTrend}
                  columns={[
                    { key: 'date', header: 'Date' },
                    { key: 'bills', header: 'Bills', numeric: true },
                    { key: 'gross', header: 'Gross', numeric: true, render: r => fmt(r.gross), sortAccessor: r => r.gross },
                    { key: 'net', header: 'Net', numeric: true, render: r => fmt(r.net), sortAccessor: r => r.net },
                    { key: 'revenue', header: 'Revenue', numeric: true, render: r => fmt(r.revenue), sortAccessor: r => r.revenue },
                    { key: 'profit', header: 'Profit', numeric: true, render: r => fmt(r.profit), sortAccessor: r => r.profit },
                  ]} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SalesSummaryPage;
