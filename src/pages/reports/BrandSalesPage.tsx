import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Download, Printer, FileSpreadsheet, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useReportScope } from '@/lib/reports/scope';
import { exportCSV, exportExcel, exportPDF, printReport } from '@/lib/reports/exporters';
import { useLocale } from '@/contexts/LocaleContext';

interface BrandRow {
  brand_id: string;
  brand_name: string;
  brand_type: 'internal' | 'external';
  products_count: number;
  qty: number;
  gross: number;
  net: number;
  discount: number;
  tax: number;
  revenue: number;
  profit: number;
  margin_pct: number;
  orders: number;
  bills: number;
  aov: number;
  prev_revenue: number;
  growth_pct: number | null;
}

interface ReportResp {
  ok: boolean;
  scope: { is_owner: boolean; store_ids: string[] };
  brands: BrandRow[];
  totals: any;
  previous_totals: any;
  bills: number;
  trend: Array<Record<string, number | string>>;
  top_products: Array<{ name: string; brandKey: string; qty: number; revenue: number }>;
  top_customers: Array<{ id: string; qty: number; spent: number }>;
  category_by_brand: Array<{ brandKey: string; categories: Array<{ category: string; revenue: number }> }>;
}

const COLORS = ['#1e3a8a', '#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#f59e0b', '#475569', '#dc2626', '#0ea5e9'];

const BrandSalesPage: React.FC = () => {
  const navigate = useNavigate();
  const scope = useReportScope();
  const { formatCurrency } = useLocale();

  const today = new Date();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: weekAgo, to: today });
  const [brandTypeFilter, setBrandTypeFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<BrandRow | null>(null);

  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [data, setData] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (scope.isOwner) {
        const { data } = await (supabase as any).from('stores').select('id, name').eq('is_active', true).order('name');
        setStores(data ?? []);
      } else if (scope.storeId) {
        setStores([{ id: scope.storeId, name: scope.storeName }]);
      }
    })();
  }, [scope.isOwner, scope.storeId]);

  const fetchReport = async () => {
    if (!dateRange?.from) { toast.error('Select a date range'); return; }
    setLoading(true);
    try {
      const from = new Date(dateRange.from); from.setHours(0, 0, 0, 0);
      const to = new Date(dateRange.to ?? dateRange.from); to.setHours(23, 59, 59, 999);

      const body: any = {
        from: from.toISOString(),
        to: to.toISOString(),
      };
      if (scope.isOwner) {
        if (storeFilter !== 'all') body.store_id = storeFilter;
      } else if (scope.storeId) {
        body.store_id = scope.storeId;
      }
      if (brandTypeFilter !== 'all') body.brand_type = brandTypeFilter;
      if (paymentFilter !== 'all') body.payment_method = paymentFilter;
      if (orderTypeFilter !== 'all') body.order_type = orderTypeFilter;

      const { data: resp, error } = await supabase.functions.invoke('brand-sales-report', { body });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Report failed');
      setData(resp as ReportResp);
      setSelectedBrand(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load report');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchReport(); /* eslint-disable-next-line */ }, [scope.storeId]);

  const totals = data?.totals ?? { gross: 0, net: 0, discount: 0, tax: 0, revenue: 0, profit: 0, qty: 0, products: 0, orders: 0 };
  const prevTotals = data?.previous_totals ?? totals;
  const overallGrowth = prevTotals.revenue > 0 ? ((totals.revenue - prevTotals.revenue) / prevTotals.revenue) * 100 : null;

  const sortedBrands = useMemo(() => {
    const rows = data?.brands ?? [];
    return [...rows].sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const pieData = sortedBrands.slice(0, 8).map((b, i) => ({ name: b.brand_name, value: b.revenue, color: COLORS[i % COLORS.length] }));

  // Trend chart data (top 5 brands stacked)
  const topBrandKeys = sortedBrands.slice(0, 5).map(b => b.brand_id);
  const trendData = (data?.trend ?? []).map((row: any) => {
    const out: any = { date: format(new Date(row.date), 'dd MMM') };
    topBrandKeys.forEach(k => { out[k] = row[k] ?? 0; });
    return out;
  });
  const keyToName = new Map(sortedBrands.map(b => [b.brand_id, b.brand_name]));

  const buildPayload = () => ({
    title: 'Brand-Wise Sales Report',
    subtitle: `${scope.isOwner ? 'Company / Multi-store' : scope.storeName}${brandTypeFilter !== 'all' ? ` • ${brandTypeFilter}` : ''}`,
    dateRange: dateRange?.from ? `${format(dateRange.from, 'dd MMM yyyy')} → ${format(dateRange.to ?? dateRange.from, 'dd MMM yyyy')}` : '',
    storeName: scope.storeName,
    kpis: [
      { label: 'Revenue', value: formatCurrency(totals.revenue || 0) },
      { label: 'Gross', value: formatCurrency(totals.gross || 0) },
      { label: 'Discount', value: formatCurrency(totals.discount || 0) },
      { label: 'Tax', value: formatCurrency(totals.tax || 0) },
      { label: 'Profit', value: formatCurrency(totals.profit || 0) },
      { label: 'Bills', value: String(data?.bills ?? 0) },
      { label: 'Items Sold', value: String(totals.qty || 0) },
      { label: 'Brands', value: String(sortedBrands.length) },
    ],
    sections: [
      {
        title: 'Brand Performance',
        headers: ['Brand', 'Type', 'Products', 'Qty', 'Gross', 'Disc', 'Tax', 'Net', 'Revenue', 'Profit', 'Margin %', 'Orders', 'AOV', 'Growth %'],
        rows: sortedBrands.map(b => [
          b.brand_name, b.brand_type, b.products_count, b.qty,
          Math.round(b.gross), Math.round(b.discount), Math.round(b.tax),
          Math.round(b.net), Math.round(b.revenue), Math.round(b.profit),
          b.margin_pct.toFixed(1), b.orders, Math.round(b.aov),
          b.growth_pct == null ? '—' : b.growth_pct.toFixed(1),
        ]),
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

  const drillProducts = selectedBrand
    ? (data?.top_products ?? []).filter(p => p.brandKey === selectedBrand.brand_id)
    : [];
  const drillCategories = selectedBrand
    ? (data?.category_by_brand ?? []).find(c => c.brandKey === selectedBrand.brand_id)?.categories ?? []
    : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="p-2 bg-primary/10 rounded-lg shrink-0"><Layers className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">Brand-Wise Sales</h1>
              <p className="text-xs text-muted-foreground truncate">
                {scope.isOwner ? 'Company analytics' : scope.storeName} • {scope.isOwner ? 'Owner view' : 'Store view'}
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
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Brand Type</div>
            <Select value={brandTypeFilter} onValueChange={setBrandTypeFilter}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="external">External</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Payment</div>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="Credit">Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Order Type</div>
            <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="dine-in">Dine-in</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { l: 'Revenue', v: formatCurrency(totals.revenue || 0) },
            { l: 'Gross', v: formatCurrency(totals.gross || 0) },
            { l: 'Discount', v: formatCurrency(totals.discount || 0) },
            { l: 'Tax', v: formatCurrency(totals.tax || 0) },
            { l: 'Profit', v: formatCurrency(totals.profit || 0) },
            { l: 'Bills', v: String(data?.bills ?? 0) },
            { l: 'Items', v: String(totals.qty || 0) },
            { l: 'Brands', v: String(sortedBrands.length) },
          ].map((k) => (
            <Card key={k.l}><CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight break-words">{k.l}</div>
              <div className="text-base font-bold mt-1">{k.v}</div>
            </CardContent></Card>
          ))}
        </div>

        {overallGrowth !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">vs previous period:</span>
            <Badge variant={overallGrowth >= 0 ? 'default' : 'destructive'} className="gap-1">
              {overallGrowth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {overallGrowth.toFixed(1)}%
            </Badge>
            <span className="text-xs text-muted-foreground">(prev revenue: {formatCurrency(prevTotals.revenue || 0)})</span>
          </div>
        )}

        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Brand Table</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            {selectedBrand && <TabsTrigger value="drill">Drill: {selectedBrand.brand_name}</TabsTrigger>}
          </TabsList>

          <TabsContent value="table">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Products</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">AOV</TableHead>
                        <TableHead className="text-right">Growth</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</TableCell></TableRow>
                      ) : sortedBrands.length === 0 ? (
                        <TableRow><TableCell colSpan={14} className="text-center py-10 text-muted-foreground">No sales in the selected period.</TableCell></TableRow>
                      ) : sortedBrands.map(b => (
                        <TableRow
                          key={b.brand_id}
                          className="cursor-pointer hover:bg-accent/40"
                          onClick={() => setSelectedBrand(b)}
                        >
                          <TableCell className="font-medium text-primary underline">{b.brand_name}</TableCell>
                          <TableCell>
                            <Badge variant={b.brand_type === 'internal' ? 'secondary' : 'default'} className="text-[10px] uppercase">{b.brand_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{b.products_count}</TableCell>
                          <TableCell className="text-right">{b.qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(b.gross)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(b.discount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(b.tax)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(b.net)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(b.revenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(b.profit)}</TableCell>
                          <TableCell className="text-right">{b.margin_pct.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">{b.orders}</TableCell>
                          <TableCell className="text-right">{formatCurrency(b.aov)}</TableCell>
                          <TableCell className="text-right">
                            {b.growth_pct == null ? <span className="text-muted-foreground">—</span> :
                              <span className={b.growth_pct >= 0 ? 'text-emerald-600' : 'text-destructive'}>{b.growth_pct.toFixed(1)}%</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground mt-2">Tip: Click any brand row to drill down to products, categories, and customers.</p>
          </TabsContent>

          <TabsContent value="charts">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Revenue Share (Top 8)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} paddingAngle={2}>
                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Top 10 Brands — Revenue</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={sortedBrands.slice(0, 10).map(b => ({ name: b.brand_name, revenue: Math.round(b.revenue), profit: Math.round(b.profit) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" height={50} />
                      <YAxis fontSize={10} />
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="revenue" fill="#1e3a8a" />
                      <Bar dataKey="profit" fill="#16a34a" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-sm">Daily Trend — Top 5 Brands</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {topBrandKeys.map((k, i) => (
                        <Line key={k} type="monotone" dataKey={k} name={keyToName.get(k) || k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {selectedBrand && (
            <TabsContent value="drill">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">{selectedBrand.brand_name} — Snapshot</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-sm">
                    <div><div className="text-muted-foreground text-xs">Revenue</div><div className="font-semibold">{formatCurrency(selectedBrand.revenue)}</div></div>
                    <div><div className="text-muted-foreground text-xs">Profit</div><div className="font-semibold">{formatCurrency(selectedBrand.profit)}</div></div>
                    <div><div className="text-muted-foreground text-xs">Items Sold</div><div className="font-semibold">{selectedBrand.qty}</div></div>
                    <div><div className="text-muted-foreground text-xs">Orders</div><div className="font-semibold">{selectedBrand.orders}</div></div>
                    <div><div className="text-muted-foreground text-xs">AOV</div><div className="font-semibold">{formatCurrency(selectedBrand.aov)}</div></div>
                    <div><div className="text-muted-foreground text-xs">Margin</div><div className="font-semibold">{selectedBrand.margin_pct.toFixed(1)}%</div></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Top Products</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {drillProducts.length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No items</TableCell></TableRow>
                        ) : drillProducts.map((p, i) => (
                          <TableRow key={i}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.qty}</TableCell><TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-sm">Category Distribution</CardTitle></CardHeader>
                  <CardContent>
                    {drillCategories.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">No category data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={drillCategories.map(c => ({ name: c.category, revenue: Math.round(c.revenue) }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={10} />
                          <YAxis fontSize={10} />
                          <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                          <Bar dataKey="revenue" fill="#7c3aed" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default BrandSalesPage;
