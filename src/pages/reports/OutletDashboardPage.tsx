import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { supabase } from '@/integrations/supabase/client';
import { useReportScope } from '@/lib/reports/scope';
import { useLocale } from '@/contexts/LocaleContext';

const COLORS = ['#1e3a8a','#7c3aed','#0891b2','#ea580c','#16a34a','#db2777','#f59e0b','#475569'];

const Kpi: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Card><CardContent className="p-3">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-lg font-bold mt-1">{value}</div>
  </CardContent></Card>
);

const OutletDashboardPage: React.FC = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const scope = useReportScope();
  const { formatCurrency } = useLocale();

  const today = new Date();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: monthAgo, to: today });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    if (!storeId || !dateRange?.from) return;
    setLoading(true);
    try {
      const from = new Date(dateRange.from); from.setHours(0,0,0,0);
      const to = new Date(dateRange.to ?? dateRange.from); to.setHours(23,59,59,999);
      const { data: resp, error } = await supabase.functions.invoke('outlet-location-report', {
        body: { mode: 'outlet-detail', store_id: storeId, from: from.toISOString(), to: to.toISOString() },
      });
      if (error || !resp?.ok) throw new Error(error?.message ?? resp?.error ?? 'Failed');
      setData(resp);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [storeId]);

  if (!scope.isOwner) {
    return <div className="p-8 text-center"><h1 className="text-2xl font-bold">403</h1><p className="text-muted-foreground">Owner-only.</p></div>;
  }

  const fmt = (n: number) => formatCurrency(Math.round(n || 0));
  const store = data?.store;
  const s = data?.summary;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/reports/outlets')}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />{store?.name ?? 'Outlet'}</h1>
            <div className="text-xs text-muted-foreground">
              {[store?.outlet_code, store?.branch_name, store?.region, store?.city, store?.state, store?.manager_name].filter(Boolean).join(' • ')}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button onClick={fetch} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}</Button>
        </div>
      </div>

      {s && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <Kpi label="Revenue" value={fmt(s.revenue)} />
            <Kpi label="Net Sales" value={fmt(s.net)} />
            <Kpi label="Gross" value={fmt(s.gross)} />
            <Kpi label="Profit" value={fmt(s.profit)} />
            <Kpi label="Tax" value={fmt(s.tax)} />
            <Kpi label="Discount" value={fmt(s.discount)} />
            <Kpi label="Orders" value={String(s.ordersCount)} />
            <Kpi label="Bills" value={String(s.billsCount)} />
            <Kpi label="AOV" value={fmt(s.aov)} />
            <Kpi label="Avg Items/Bill" value={(s.avgItems ?? 0).toFixed(1)} />
            <Kpi label="Cancelled" value={String(s.cancelled)} />
            <Kpi label="Returns" value={String(s.returns)} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Area dataKey="revenue" stroke="#1e3a8a" fill="#1e3a8a33" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Profit Trend</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Line dataKey="profit" stroke="#16a34a" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Hourly Sales</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="key" tick={{ fontSize: 11 }} /><YAxis /><Tooltip formatter={(v: any) => fmt(Number(v))} /><Bar dataKey="value" fill="#7c3aed" /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Daily Sales</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="key" tick={{ fontSize: 11 }} /><YAxis /><Tooltip formatter={(v: any) => fmt(Number(v))} /><Line dataKey="value" stroke="#1e3a8a" /></LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Monthly Sales</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="key" tick={{ fontSize: 11 }} /><YAxis /><Tooltip formatter={(v: any) => fmt(Number(v))} /><Bar dataKey="value" fill="#ea580c" /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Yearly Sales</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.yearly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="key" /><YAxis /><Tooltip formatter={(v: any) => fmt(Number(v))} /><Bar dataKey="value" fill="#16a34a" /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
              <CardContent className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader><TableBody>
                {data.top_products.map((p: any, i: number) => <TableRow key={i}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.qty}</TableCell><TableCell className="text-right">{fmt(p.revenue)}</TableCell></TableRow>)}
              </TableBody></Table></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top Categories</CardTitle></CardHeader>
              <CardContent className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader><TableBody>
                {data.top_categories.map((c: any, i: number) => <TableRow key={i}><TableCell>{c.name}</TableCell><TableCell className="text-right">{fmt(c.revenue)}</TableCell></TableRow>)}
              </TableBody></Table></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top Customers</CardTitle></CardHeader>
              <CardContent className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Spent</TableHead></TableRow></TableHeader><TableBody>
                {data.top_customers.map((c: any, i: number) => <TableRow key={i}><TableCell className="font-mono text-xs">{c.id.slice(0, 8)}</TableCell><TableCell className="text-right">{c.orders}</TableCell><TableCell className="text-right">{fmt(c.spent)}</TableCell></TableRow>)}
              </TableBody></Table></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Payment Analysis</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.payments} dataKey="amount" nameKey="method" outerRadius={100} label>
                    {data.payments.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(Number(v))} /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default OutletDashboardPage;
