import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Download, FileSpreadsheet, Printer, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useReportScope } from '@/lib/reports/scope';
import { exportCSV, exportExcel, exportPDF, printReport } from '@/lib/reports/exporters';
import { useLocale } from '@/contexts/LocaleContext';

const COLORS = ['#1e3a8a','#7c3aed','#0891b2','#ea580c','#16a34a','#db2777','#f59e0b','#475569','#dc2626','#0ea5e9'];

type AnyRow = Record<string, any>;

const OutletLocationReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const scope = useReportScope();
  const { formatCurrency } = useLocale();

  const today = new Date();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: monthAgo, to: today });

  const [storeFilter, setStoreFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');

  const [stores, setStores] = useState<AnyRow[]>([]);
  const [tab, setTab] = useState<'outlets'|'branches'|'regions'|'counters'|'comparison'>('outlets');

  const [outlets, setOutlets] = useState<AnyRow[]>([]);
  const [branches, setBranches] = useState<AnyRow[]>([]);
  const [regions, setRegions] = useState<AnyRow[]>([]);
  const [counters, setCounters] = useState<AnyRow[]>([]);
  const [hasRegion, setHasRegion] = useState(false);
  const [loading, setLoading] = useState(false);

  // comparison state
  const [cmpStoreA, setCmpStoreA] = useState<string>('');
  const [cmpStoreB, setCmpStoreB] = useState<string>('');
  const [cmpDataA, setCmpDataA] = useState<AnyRow | null>(null);
  const [cmpDataB, setCmpDataB] = useState<AnyRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('stores')
        .select('id, name, branch_name, region, manager_name')
        .eq('is_active', true).order('name');
      setStores(data ?? []);
    })();
  }, []);

  const buildBody = (mode: string, extra: AnyRow = {}) => {
    const from = new Date(dateRange!.from!); from.setHours(0,0,0,0);
    const to = new Date(dateRange?.to ?? dateRange!.from!); to.setHours(23,59,59,999);
    const body: AnyRow = { mode, from: from.toISOString(), to: to.toISOString(), ...extra };
    if (storeFilter !== 'all') body.store_id = storeFilter;
    if (branchFilter !== 'all') body.branch = branchFilter;
    if (regionFilter !== 'all') body.region = regionFilter;
    if (stateFilter) body.state = stateFilter;
    if (cityFilter) body.city = cityFilter;
    if (managerFilter) body.manager = managerFilter;
    return body;
  };

  const fetchAll = async () => {
    if (!dateRange?.from) { toast.error('Pick a date range'); return; }
    setLoading(true);
    try {
      const [o, b, r, c] = await Promise.all([
        supabase.functions.invoke('outlet-location-report', { body: buildBody('outlets') }),
        supabase.functions.invoke('outlet-location-report', { body: buildBody('branches') }),
        supabase.functions.invoke('outlet-location-report', { body: buildBody('regions') }),
        supabase.functions.invoke('outlet-location-report', { body: buildBody('counters') }),
      ]);
      if (o.error || !o.data?.ok) throw new Error(o.error?.message ?? o.data?.error ?? 'Outlets failed');
      setOutlets(o.data.rows ?? []);
      setHasRegion(!!o.data.has_region);
      setBranches(b.data?.rows ?? []);
      setRegions(r.data?.rows ?? []);
      setCounters(c.data?.rows ?? []);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load reports');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, []);

  const runComparison = async () => {
    if (!cmpStoreA || !cmpStoreB) { toast.error('Pick two outlets'); return; }
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        supabase.functions.invoke('outlet-location-report', { body: buildBody('outlet-detail', { store_id: cmpStoreA }) }),
        supabase.functions.invoke('outlet-location-report', { body: buildBody('outlet-detail', { store_id: cmpStoreB }) }),
      ]);
      if (!a.data?.ok || !b.data?.ok) throw new Error('Comparison failed');
      setCmpDataA(a.data); setCmpDataB(b.data);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  const exportFor = (rows: AnyRow[], name: string, kind: 'csv'|'xlsx'|'pdf'|'print') => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    const headers = Object.keys(rows[0]);
    const payload = {
      title: name,
      dateRange: dateRange?.from ? `${dateRange.from.toLocaleDateString()} – ${(dateRange.to ?? dateRange.from).toLocaleDateString()}` : undefined,
      sections: [{ title: name, headers, rows: rows.map(r => headers.map(h => r[h] ?? '')) }],
    };
    if (kind === 'csv') exportCSV(payload);
    else if (kind === 'xlsx') exportExcel(payload);
    else if (kind === 'pdf') exportPDF(payload);
    else printReport(payload);
  };

  const branchOptions = useMemo(() =>
    [...new Set(stores.map((s) => s.branch_name).filter(Boolean))] as string[], [stores]);
  const regionOptions = useMemo(() =>
    [...new Set(stores.map((s) => s.region).filter(Boolean))] as string[], [stores]);

  if (!scope.isOwner) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold">403</h1>
        <p className="text-muted-foreground">Outlet & Location Reports are available to owner accounts only.</p>
      </div>
    );
  }

  const fmt = (n: number) => formatCurrency(Math.round(n));

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Outlet & Location Reports</h1>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2"><DatePickerWithRange date={dateRange} setDate={setDateRange} /></div>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger><SelectValue placeholder="Outlet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outlets</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branchOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          {regionOptions.length > 0 && (
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger><SelectValue placeholder="Region" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {regionOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input placeholder="State" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} />
          <Input placeholder="City" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
          <Input placeholder="Manager" value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} />
          <Button onClick={fetchAll} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Apply
          </Button>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          {hasRegion && <TabsTrigger value="regions">Regions</TabsTrigger>}
          <TabsTrigger value="counters">Counters</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
        </TabsList>

        {/* OUTLETS */}
        <TabsContent value="outlets" className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => exportFor(outlets, 'outlets', 'csv')}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(outlets, 'outlets', 'xlsx')}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(outlets, 'outlets', 'pdf')}>PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(outlets, 'outlets', 'print')}><Printer className="w-4 h-4 mr-1" />Print</Button>
          </div>

          <Card>
            <CardHeader><CardTitle>Outlet-wise Sales</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Returns</TableHead>
                    <TableHead className="text-right">Cancelled</TableHead>
                    <TableHead className="text-right">AOV</TableHead>
                    <TableHead className="text-right">Avg Items/Bill</TableHead>
                    <TableHead className="text-right">Growth %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outlets.map((r) => (
                    <TableRow key={r.store_id} className="cursor-pointer" onClick={() => navigate(`/reports/outlets/${r.store_id}`)}>
                      <TableCell className="font-medium">{r.outlet_name}</TableCell>
                      <TableCell>{r.outlet_code ?? '—'}</TableCell>
                      <TableCell>{r.manager ?? '—'}</TableCell>
                      <TableCell>{r.city ?? '—'}</TableCell>
                      <TableCell>{r.state ?? '—'}</TableCell>
                      <TableCell className="text-right">{r.orders}</TableCell>
                      <TableCell className="text-right">{r.bills}</TableCell>
                      <TableCell className="text-right">{fmt(r.gross)}</TableCell>
                      <TableCell className="text-right">{fmt(r.net)}</TableCell>
                      <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                      <TableCell className="text-right">{fmt(r.profit)}</TableCell>
                      <TableCell className="text-right">{r.margin_pct?.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{fmt(r.discount)}</TableCell>
                      <TableCell className="text-right">{fmt(r.tax)}</TableCell>
                      <TableCell className="text-right">{r.returns}</TableCell>
                      <TableCell className="text-right">{r.cancelled}</TableCell>
                      <TableCell className="text-right">{fmt(r.aov)}</TableCell>
                      <TableCell className="text-right">{r.avg_items?.toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        {r.growth_pct == null ? '—' : (
                          <span className={r.growth_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {r.growth_pct >= 0 ? <TrendingUp className="inline w-3 h-3 mr-1" /> : <TrendingDown className="inline w-3 h-3 mr-1" />}
                            {r.growth_pct.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {outlets.length === 0 && <TableRow><TableCell colSpan={19} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Outlet Ranking (Revenue)</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outlets.slice().sort((a,b)=>b.revenue-a.revenue).slice(0,10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="outlet_name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Bar dataKey="revenue" fill="#1e3a8a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Growth Trend</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={outlets.map(o => ({ name: o.outlet_name, growth: o.growth_pct ?? 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Line dataKey="growth" stroke="#16a34a" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* BRANCHES */}
        <TabsContent value="branches" className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => exportFor(branches, 'branches', 'csv')}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(branches, 'branches', 'xlsx')}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(branches, 'branches', 'pdf')}>PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(branches, 'branches', 'print')}><Printer className="w-4 h-4 mr-1" />Print</Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Branch-wise Sales</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead><TableHead className="text-right">Outlets</TableHead>
                    <TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead><TableHead className="text-right">AOV</TableHead>
                    <TableHead className="text-right">Growth %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.branch_name}</TableCell>
                      <TableCell className="text-right">{r.outlets}</TableCell>
                      <TableCell className="text-right">{r.orders}</TableCell>
                      <TableCell className="text-right">{r.bills}</TableCell>
                      <TableCell className="text-right">{fmt(r.sales)}</TableCell>
                      <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                      <TableCell className="text-right">{fmt(r.profit)}</TableCell>
                      <TableCell className="text-right">{fmt(r.aov)}</TableCell>
                      <TableCell className="text-right">{r.growth_pct == null ? '—' : `${r.growth_pct.toFixed(1)}%`}</TableCell>
                    </TableRow>
                  ))}
                  {branches.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Branch Revenue Ranking</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branches}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="branch_name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Bar dataKey="revenue" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REGIONS */}
        {hasRegion && (
          <TabsContent value="regions" className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => exportFor(regions, 'regions', 'csv')}><Download className="w-4 h-4 mr-1" />CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportFor(regions, 'regions', 'xlsx')}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
              <Button variant="outline" size="sm" onClick={() => exportFor(regions, 'regions', 'pdf')}>PDF</Button>
              <Button variant="outline" size="sm" onClick={() => exportFor(regions, 'regions', 'print')}><Printer className="w-4 h-4 mr-1" />Print</Button>
            </div>
            <Card>
              <CardHeader><CardTitle>Region-wise Sales</CardTitle></CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Region</TableHead><TableHead className="text-right">Branches</TableHead>
                      <TableHead className="text-right">Outlets</TableHead><TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Growth %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regions.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.region}</TableCell>
                        <TableCell className="text-right">{r.branches}</TableCell>
                        <TableCell className="text-right">{r.outlets}</TableCell>
                        <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                        <TableCell className="text-right">{fmt(r.sales)}</TableCell>
                        <TableCell className="text-right">{fmt(r.profit)}</TableCell>
                        <TableCell className="text-right">{r.growth_pct == null ? '—' : `${r.growth_pct.toFixed(1)}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Region Distribution</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={regions} dataKey="revenue" nameKey="region" outerRadius={100} label>
                      {regions.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* COUNTERS */}
        <TabsContent value="counters" className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => exportFor(counters, 'counters', 'csv')}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(counters, 'counters', 'xlsx')}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(counters, 'counters', 'pdf')}>PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportFor(counters, 'counters', 'print')}><Printer className="w-4 h-4 mr-1" />Print</Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Counter-wise Sales</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Counter</TableHead><TableHead>ID</TableHead><TableHead>Cashier</TableHead>
                    <TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">AOV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counters.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.counter_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.counter_id?.slice(0, 12)}</TableCell>
                      <TableCell>{r.cashier}</TableCell>
                      <TableCell className="text-right">{r.orders}</TableCell>
                      <TableCell className="text-right">{r.bills}</TableCell>
                      <TableCell className="text-right">{fmt(r.gross)}</TableCell>
                      <TableCell className="text-right">{fmt(r.net)}</TableCell>
                      <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                      <TableCell className="text-right">{fmt(r.aov)}</TableCell>
                    </TableRow>
                  ))}
                  {counters.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPARISON */}
        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Outlet vs Outlet</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Select value={cmpStoreA} onValueChange={setCmpStoreA}>
                  <SelectTrigger><SelectValue placeholder="Outlet A" /></SelectTrigger>
                  <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Select value={cmpStoreB} onValueChange={setCmpStoreB}>
                  <SelectTrigger><SelectValue placeholder="Outlet B" /></SelectTrigger>
                  <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={runComparison} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Compare
              </Button>
            </CardContent>
          </Card>

          {cmpDataA && cmpDataB && (
            <div className="grid md:grid-cols-2 gap-4">
              {[cmpDataA, cmpDataB].map((d, idx) => (
                <Card key={idx}>
                  <CardHeader><CardTitle>{d.store?.name}</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Revenue</span><b>{fmt(d.summary.revenue)}</b></div>
                    <div className="flex justify-between"><span>Net</span><b>{fmt(d.summary.net)}</b></div>
                    <div className="flex justify-between"><span>Orders</span><b>{d.summary.ordersCount}</b></div>
                    <div className="flex justify-between"><span>Bills</span><b>{d.summary.billsCount}</b></div>
                    <div className="flex justify-between"><span>AOV</span><b>{fmt(d.summary.aov)}</b></div>
                    <div className="flex justify-between"><span>Cancelled</span><b>{d.summary.cancelled}</b></div>
                  </CardContent>
                </Card>
              ))}
              <Card className="md:col-span-2">
                <CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" allowDuplicatedCategory={false} />
                      <YAxis />
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                      <Legend />
                      <Line data={cmpDataA.trend} dataKey="revenue" name={cmpDataA.store?.name} stroke="#1e3a8a" />
                      <Line data={cmpDataB.trend} dataKey="revenue" name={cmpDataB.store?.name} stroke="#ea580c" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OutletLocationReportsPage;
