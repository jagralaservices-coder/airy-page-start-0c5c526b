import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Store, DollarSign, ShoppingBag, Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

const KPICard = ({ title, value, icon: Icon, isCurrency = false, loading }: any) => (
  <Card className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border-gray-200/50 dark:border-gray-800/50 shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</CardTitle>
      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {loading ? '—' : `${isCurrency ? '₹' : ''}${typeof value === 'number' ? value.toLocaleString('en-IN') : value ?? 0}`}
      </div>
    </CardContent>
  </Card>
);

export default function ExecutiveDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    merchants: 0,
    stores: 0,
    orders: 0,
    revenue: 0,
    platformRevenue: 0,
    customers: 0,
  });
  const [revenueSeries, setRevenueSeries] = useState<Array<{ date: string; revenue: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [m, s, o, c, recent, platformRev, activeCustomers] = await Promise.all([
        supabase.from('merchants').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('total, created_at').gte('created_at', since).limit(5000),
        supabase.from('revenue_audit').select('amount_added').gte('created_at', since),
        supabase.from('customers').select('subscription_plan, enabled_addons').eq('is_active', true).eq('approval_status', 'approved'),
      ]);
      if (cancelled) return;
      const totalRevenue = (recent.data ?? []).reduce((sum, r: any) => sum + Number(r.total ?? 0), 0);
      let totalPlatformRevenue = (platformRev.data ?? []).reduce((sum, r: any) => sum + Number(r.amount_added ?? 0), 0);

      // Fallback for legacy merchants if revenue_audit is empty
      if (totalPlatformRevenue === 0 && activeCustomers.data && activeCustomers.data.length > 0) {
        const PLAN_PRICING: Record<string, number> = { basic: 7999, gold: 14999, platinum: 24999, custom: 0 };
        const ADDONS_PRICING: Record<string, number> = {
          'QR Ordering Menu': 1999, 'Staff Management': 1999, 'Delivery System': 2999, 'Barcode Scanner': 999,
          'Recipe Management': 3999, 'Team Chat': 999, 'Executive Sales Dashboard': 2999, 'Employee Summary': 1499,
          'Group Summary': 1499, 'Transaction Summary': 1499, 'Cover Size Summary': 1499, 'ZIP Summary': 1499,
          'Counter Summary': 1499, 'Expense Tracker': 1999, 'Cash Flow': 1999, 'Withdrawal Report': 999,
          'P&L Report': 2999, 'Sales Trend Report': 1999, 'Hourly Sales': 999, 'Customer Report': 1499,
          'Loss Control': 2999, 'Table/KOT System': 2999, 'Item Report': 1499, 'Retention Report': 1999,
          'Target Report': 1999, 'Kitchen Display System (KDS)': 3999, 'Invoices': 999, 'AI Insights': 4999,
          'Smart Inventory AI': 4999, 'Billing POS Additional Device': 1999, 'Multi Outlet Dashboard': 4999,
          'Basic Inventory': 1999, 'Customer Management': 1999, 'Sales Comments': 999, 'Order Summary': 999,
          'Category Summary': 999, 'Item Summary': 999, 'Payment Reports': 1499,
        };
        totalPlatformRevenue = activeCustomers.data.reduce((sum, customer: any) => {
          let amount = PLAN_PRICING[customer.subscription_plan || 'basic'] || 0;
          if (customer.subscription_plan === 'custom' && Array.isArray(customer.enabled_addons)) {
            customer.enabled_addons.forEach((addon: string) => { amount += ADDONS_PRICING[addon] || 0; });
          }
          return sum + amount;
        }, 0);
      }

      
      const byDay = new Map<string, number>();
      (recent.data ?? []).forEach((r: any) => {
        const d = (r.created_at ?? '').slice(0, 10);
        if (!d) return;
        byDay.set(d, (byDay.get(d) ?? 0) + Number(r.total ?? 0));
      });
      const series = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, revenue]) => ({ date: date.slice(5), revenue }));
      setKpis({
        merchants: m.count ?? 0,
        stores: s.count ?? 0,
        orders: o.count ?? 0,
        revenue: totalRevenue,
        platformRevenue: totalPlatformRevenue,
        customers: c.count ?? 0,
      });
      setRevenueSeries(series);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Executive Overview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Live platform performance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <KPICard title="Active Merchants" value={kpis.merchants} icon={Users} loading={loading} />
        <KPICard title="Active Stores" value={kpis.stores} icon={Store} loading={loading} />
        <KPICard title="Total Orders" value={kpis.orders} icon={ShoppingBag} loading={loading} />
        <KPICard title="Merchant Revenue (30d)" value={kpis.revenue} icon={DollarSign} loading={loading} isCurrency />
        <KPICard title="Platform Revenue (30d)" value={kpis.platformRevenue} icon={TrendingUp} loading={loading} isCurrency />
        <KPICard title="Customers" value={kpis.customers} icon={Users} loading={loading} />
      </div>

      <Card className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl">
        <CardHeader><CardTitle>Revenue Trend (Last 30 Days)</CardTitle></CardHeader>
        <CardContent className="h-[300px]">
          {revenueSeries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Inbox className="w-10 h-10 mb-2" />
              <p className="text-sm">No revenue data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
