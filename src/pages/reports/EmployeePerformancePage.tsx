import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Download, FileSpreadsheet, Printer, Loader2, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useReportScope } from '@/lib/reports/scope';
import { exportCSV, exportExcel, exportPDF, printReport } from '@/lib/reports/exporters';
import { useLocale } from '@/contexts/LocaleContext';

type Row = {
  user_role_id: string; user_id: string; name: string; email?: string;
  staff_code?: string | null; role: string;
  store_id?: string; store_name?: string; outlet_code?: string | null;
  branch_name?: string | null; region?: string | null; is_active: boolean;
  orders: number; bills: number; gross: number; net: number; revenue: number;
  profit: number; aov: number; discount: number;
  returns: number; refunds: number; cancelled: number; growth_pct: number | null;
};

const EmployeePerformancePage: React.FC = () => {
  const navigate = useNavigate();
  const scope = useReportScope();
  const { formatCurrency } = useLocale();

  const today = new Date();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: monthAgo, to: today });

  const [stores, setStores] = useState<Array<{ id: string; name: string; branch_name?: string | null }>>([]);
  const [storeFilter, setStoreFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<any>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stores').select('id, name, branch_name').eq('is_active', true);
      setStores((data ?? []) as any);
    })();
  }, []);

  const fetchData = async () => {
    if (!dateRange?.from) return;
    setLoading(true);
    try {
      const body: any = {
        mode: 'list',
        from: dateRange.from.toISOString(),
        to: (dateRange.to ?? dateRange.from).toISOString(),
      };
      if (storeFilter !== 'all') body.store_id = storeFilter;
      if (roleFilter !== 'all') body.role = roleFilter;
      const { data, error } = await supabase.functions.invoke('employee-performance', { body });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'failed');
      setRows(data.rows || []);
      setSummary(data.summary || {});
    } catch (e: any) {
      toast.error(e.message || 'Failed to load employee performance');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [dateRange?.from, dateRange?.to, storeFilter, roleFilter]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (branchFilter !== 'all' && (r.branch_name || '') !== branchFilter) return false;
      if (employeeFilter !== 'all' && r.user_id !== employeeFilter) return false;
      if (search && !(`${r.name} ${r.email ?? ''} ${r.staff_code ?? ''}`.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [rows, branchFilter, employeeFilter, search]);

  const branches = useMemo(() => Array.from(new Set(stores.map((s) => s.branch_name).filter(Boolean))) as string[], [stores]);

  const fmt = (n: number) => formatCurrency(Math.round(n));

  const buildExport = () => {
    const headers = ['Employee', 'Role', 'Store', ...(scope.isOwner ? ['Outlet', 'Branch'] : []), 'Status', 'Orders', 'Bills', 'Gross', 'Net', 'Revenue', 'Profit', 'AOV', 'Discount', 'Returns', 'Refunds', 'Cancelled', 'Growth %'];
    return {
      title: 'Employee Performance',
      dateRange: dateRange?.from ? `${dateRange.from.toLocaleDateString()} – ${(dateRange.to ?? dateRange.from).toLocaleDateString()}` : undefined,
      sections: [{
        title: 'Employees',
        headers,
        rows: filtered.map((r) => [
          r.name, r.role, r.store_name ?? '',
          ...(scope.isOwner ? [r.outlet_code ?? '', r.branch_name ?? ''] : []),
          r.is_active ? 'Active' : 'Inactive',
          r.orders, r.bills, Math.round(r.gross), Math.round(r.net), Math.round(r.revenue),
          Math.round(r.profit), Math.round(r.aov), Math.round(r.discount),
          r.returns, r.refunds, r.cancelled, r.growth_pct == null ? '—' : `${r.growth_pct.toFixed(1)}%`,
        ]),
      }],
    };
  };

  const doExport = (kind: 'csv' | 'xlsx' | 'pdf' | 'print') => {
    if (!filtered.length) { toast.error('Nothing to export'); return; }
    const payload = buildExport();
    if (kind === 'csv') exportCSV(payload);
    else if (kind === 'xlsx') exportExcel(payload);
    else if (kind === 'pdf') exportPDF(payload);
    else printReport(payload);
  };

  const chartData = useMemo(() => filtered.slice().sort((a, b) => b.net - a.net).slice(0, 10).map((r) => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + '…' : r.name,
    Sales: Math.round(r.net), Profit: Math.round(r.profit),
  })), [filtered]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports')}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><Users className="h-6 w-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">Employee Performance</h1>
              <p className="text-sm text-muted-foreground">{scope.isOwner ? 'Company-wide employee analytics' : `Employees of ${scope.storeName}`}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button variant="outline" size="sm" onClick={() => doExport('print')}><Printer className="h-4 w-4 mr-1" />Print</Button>
          <Button variant="outline" size="sm" onClick={() => doExport('csv')}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
          <Button variant="outline" size="sm" onClick={() => doExport('pdf')}><Download className="h-4 w-4 mr-1" />PDF</Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <Input placeholder="Search name, code, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="cashier">Cashier</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="store_manager">Store Manager</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
          {scope.isOwner && (
            <>
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
                  {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Employees', value: summary.total_employees ?? 0 },
          { label: 'Active Employees', value: summary.active_employees ?? 0 },
          { label: 'Total Sales', value: fmt(summary.total_sales ?? 0) },
          { label: 'Total Orders', value: summary.total_orders ?? 0 },
          { label: 'Total Bills', value: summary.total_bills ?? 0 },
          { label: 'Avg Bill Value', value: fmt(summary.avg_bill_value ?? 0) },
          { label: 'Avg Sales / Employee', value: fmt(summary.avg_sales_per_employee ?? 0) },
          { label: 'Highest Performer', value: summary.highest_performer?.name ?? '—', sub: summary.highest_performer ? fmt(summary.highest_performer.sales) : '' },
          { label: 'Lowest Performer', value: summary.lowest_performer?.name ?? '—', sub: summary.lowest_performer ? fmt(summary.lowest_performer.sales) : '' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-base md:text-xl font-bold break-words">{s.value}</p>
              {(s as any).sub && <p className="text-xs text-muted-foreground">{(s as any).sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader><CardTitle>Top 10 by Sales</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          {chartData.length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">No data</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" /><YAxis />
                <Tooltip /><Legend />
                <Bar dataKey="Sales" fill="#1e3a8a" /><Bar dataKey="Profit" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Employees ({filtered.length})</CardTitle>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Store</TableHead>
                {scope.isOwner && <TableHead>Outlet</TableHead>}
                {scope.isOwner && <TableHead>Branch</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Returns</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead className="text-right">Growth %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={scope.isOwner ? 18 : 16} className="text-center text-muted-foreground py-8">No employee data</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.user_role_id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/reports/employee/${r.user_id}`)}>
                  <TableCell className="font-medium">
                    <div>{r.name}</div>
                    {r.staff_code && <div className="text-xs text-muted-foreground">{r.staff_code}</div>}
                  </TableCell>
                  <TableCell className="capitalize">{r.role.replace('_', ' ')}</TableCell>
                  <TableCell>{r.store_name ?? '—'}</TableCell>
                  {scope.isOwner && <TableCell>{r.outlet_code ?? '—'}</TableCell>}
                  {scope.isOwner && <TableCell>{r.branch_name ?? '—'}</TableCell>}
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-xs ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-right">{r.bills}</TableCell>
                  <TableCell className="text-right">{fmt(r.gross)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(r.net)}</TableCell>
                  <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.profit)}</TableCell>
                  <TableCell className="text-right">{fmt(r.aov)}</TableCell>
                  <TableCell className="text-right">{fmt(r.discount)}</TableCell>
                  <TableCell className="text-right">{r.returns}</TableCell>
                  <TableCell className="text-right">{r.refunds}</TableCell>
                  <TableCell className="text-right">{r.cancelled}</TableCell>
                  <TableCell className="text-right">
                    {r.growth_pct == null ? <span className="text-muted-foreground">—</span> : (
                      <span className={`inline-flex items-center gap-1 ${r.growth_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {r.growth_pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {r.growth_pct.toFixed(1)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeePerformancePage;
