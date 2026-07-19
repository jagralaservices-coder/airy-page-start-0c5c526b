import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, Loader2, TrendingUp, TrendingDown, Download, Printer } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useReportScope } from '@/lib/reports/scope';
import { useLocale } from '@/contexts/LocaleContext';
import { exportCSV, exportPDF, printReport } from '@/lib/reports/exporters';

const COLORS = ['#1e3a8a', '#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#f59e0b', '#475569', '#dc2626', '#0ea5e9'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EmployeeDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams();
  const scope = useReportScope();
  const { formatCurrency } = useLocale();

  const today = new Date();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: monthAgo, to: today });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [target, setTarget] = useState<number>(() => Number(localStorage.getItem(`emp_target_${userId}`) || 100000));

  useEffect(() => { localStorage.setItem(`emp_target_${userId}`, String(target)); }, [target, userId]);

  const fetchData = async () => {
    if (!dateRange?.from || !userId) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('employee-performance', {
        body: {
          mode: 'detail', user_id: userId,
          from: dateRange.from.toISOString(),
          to: (dateRange.to ?? dateRange.from).toISOString(),
        },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || 'failed');
      setData(res);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load employee dashboard');
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [userId, dateRange?.from, dateRange?.to]);

  const fmt = (n: number) => formatCurrency(Math.round(n || 0));
  const s = data?.summary ?? {};
  const achievementPct = target > 0 ? Math.min(100, (s.net || 0) / target * 100) : 0;

  const buildExport = () => ({
    title: `Employee Performance – ${data?.employee?.name ?? ''}`,
    dateRange: dateRange?.from ? `${dateRange.from.toLocaleDateString()} – ${(dateRange.to ?? dateRange.from).toLocaleDateString()}` : undefined,
    sections: [
      { title: 'Summary', headers: ['Metric', 'Value'], rows: [
        ['Net Sales', fmt(s.net)], ['Revenue', fmt(s.revenue)], ['Orders', s.orders ?? 0], ['Bills', s.bills ?? 0],
        ['AOV', fmt(s.aov)], ['Discount', fmt(s.discount)], ['Returns', s.returns ?? 0],
        ['Refunds', s.refunds ?? 0], ['Cancelled', s.cancelled ?? 0],
        ['Target', fmt(target)], ['Achievement %', achievementPct.toFixed(1) + '%'],
      ]},
      { title: 'Top Products', headers: ['Product', 'Qty', 'Revenue'], rows: (data?.top_products ?? []).map((p: any) => [p.name, p.qty, fmt(p.revenue)]) },
      { title: 'Payments', headers: ['Method', 'Amount'], rows: (data?.payments ?? []).map((p: any) => [p.method, fmt(p.amount)]) },
    ],
  });

  if (loading && !data) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!data) {
    return <div className="p-6 text-muted-foreground">No data.</div>;
  }

  const emp = data.employee;
  const paymentChart = (data.payments ?? []).map((p: any, i: number) => ({ name: p.method, value: p.amount, fill: COLORS[i % COLORS.length] }));
  const categoryChart = (data.top_categories ?? []).map((c: any, i: number) => ({ name: c.name, value: c.revenue, fill: COLORS[i % COLORS.length] }));

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports/employee')}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><User className="h-6 w-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">{emp.name}</h1>
              <p className="text-sm text-muted-foreground capitalize">
                {emp.role?.replace('_', ' ')} {emp.store_name ? `• ${emp.store_name}` : ''} {emp.branch_name ? `• ${emp.branch_name}` : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button variant="outline" size="sm" onClick={() => printReport(buildExport())}><Printer className="h-4 w-4 mr-1" />Print</Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV(buildExport())}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(buildExport())}><Download className="h-4 w-4 mr-1" />PDF</Button>
        </div>
      </div>

      {/* Sales Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: 'Net Sales', v: fmt(s.net) },
          { l: 'Revenue', v: fmt(s.revenue) },
          { l: 'Orders', v: s.orders ?? 0 },
          { l: 'Bills', v: s.bills ?? 0 },
          { l: 'AOV', v: fmt(s.aov) },
          { l: 'Items Sold', v: s.items ?? 0 },
          { l: 'Highest Bill', v: fmt(s.highest) },
          { l: 'Lowest Bill', v: fmt(s.lowest) },
          { l: 'Discount Given', v: fmt(s.discount) },
          { l: 'Growth %', v: s.growth_pct == null ? '—' : (
            <span className={`inline-flex items-center gap-1 ${s.growth_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {s.growth_pct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {s.growth_pct.toFixed(1)}%
            </span>
          ) },
        ].map((k) => (
          <Card key={k.l}><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{k.l}</p>
            <p className="text-base md:text-xl font-bold">{k.v}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Target Performance */}
      <Card>
        <CardHeader><CardTitle>Target Performance</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm">Sales Target:</label>
            <Input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)} className="max-w-[180px]" />
            <span className="text-sm text-muted-foreground">Achieved: <b>{fmt(s.net || 0)}</b></span>
            <span className="text-sm text-muted-foreground">Remaining: <b>{fmt(Math.max(0, target - (s.net || 0)))}</b></span>
            <span className="text-sm font-semibold">{achievementPct.toFixed(1)}%</span>
          </div>
          <Progress value={achievementPct} />
        </CardContent>
      </Card>

      {/* Refund / Return / Cancellation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { l: 'Returns', v: s.returns ?? 0 },
          { l: 'Refunds', v: s.refunds ?? 0 },
          { l: 'Cancelled Bills', v: s.cancelled ?? 0 },
        ].map((k) => (
          <Card key={k.l}><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{k.l}</p>
            <p className="text-2xl font-bold">{k.v}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Sales Trend (Daily)</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            {(data.daily ?? []).length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#1e3a8a" fill="#1e3a8a33" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Orders Trend</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            {(data.daily ?? []).length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip />
                  <Line type="monotone" dataKey="orders" stroke="#16a34a" /><Line type="monotone" dataKey="bills" stroke="#ea580c" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Monthly Performance</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            {(data.monthly ?? []).length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="key" /><YAxis /><Tooltip />
                  <Bar dataKey="value" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Yearly Performance</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            {(data.yearly ?? []).length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.yearly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="key" /><YAxis /><Tooltip />
                  <Bar dataKey="value" fill="#0891b2" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment / Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Payment Distribution</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {paymentChart.length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} label>
                    {paymentChart.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Category Distribution</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {categoryChart.length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} label>
                    {categoryChart.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products & Top Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top Products Sold</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data.top_products ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No products</TableCell></TableRow>
                ) : data.top_products.map((p: any, i: number) => (
                  <TableRow key={i}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.qty}</TableCell><TableCell className="text-right">{fmt(p.revenue)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top Customers</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data.top_customers ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No customers</TableCell></TableRow>
                ) : data.top_customers.map((c: any) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/customers/${c.id}`)}>
                    <TableCell className="font-mono text-xs">{c.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{c.orders}</TableCell>
                    <TableCell className="text-right">{fmt(c.spent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Work Performance */}
      <Card>
        <CardHeader><CardTitle>Work Performance</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><p className="text-xs text-muted-foreground">Peak Sales Hour</p><p className="text-lg font-bold">{data.peak_hour ? `${String(data.peak_hour.hour).padStart(2, '0')}:00` : '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Peak Sales Day</p><p className="text-lg font-bold">{data.peak_day ? DOW[data.peak_day.dow] : '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Highest Bill</p><p className="text-lg font-bold">{fmt(s.highest)}</p></div>
          <div><p className="text-xs text-muted-foreground">Lowest Bill</p><p className="text-lg font-bold">{fmt(s.lowest)}</p></div>
          <div className="col-span-2 md:col-span-4 text-xs text-muted-foreground italic">
            HR-ready: Attendance, Working Hours, Leaves, Late Arrivals, Incentives, Commissions, Payroll, Shift Performance — wired here when HR module ships.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeDashboardPage;
