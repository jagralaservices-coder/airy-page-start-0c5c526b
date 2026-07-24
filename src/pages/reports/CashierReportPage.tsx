import React, { useMemo, useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useLocale } from '@/contexts/LocaleContext';
import { ArrowLeft, Download, Printer, Users, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { printReport, formatReportCurrency } from '@/lib/reportPrintUtils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface CashierAggregate {
  cashierId: string;
  cashierName: string;
  totalOrders: number;
  totalSales: number;
  cancelledOrders: number;
  avgOrderValue: number;
  orders: any[];
}

const UNKNOWN_KEY = '__unknown__';

const CashierReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { formatCurrency } = useLocale();
  const { filteredOrders: orders, isLoading } = useAnalytics('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo<CashierAggregate[]>(() => {
    const map = new Map<string, CashierAggregate>();
    orders.forEach((o) => {
      const key = o.cashierId || o.cashierName || UNKNOWN_KEY;
      const name = o.cashierName || (o.cashierId ? o.cashierId.slice(0, 8) : 'Unassigned');
      const entry = map.get(key) || {
        cashierId: o.cashierId || '',
        cashierName: name,
        totalOrders: 0,
        totalSales: 0,
        cancelledOrders: 0,
        avgOrderValue: 0,
        orders: [] as any[],
      };
      entry.orders.push(o);
      if (o.status === 'cancelled') {
        entry.cancelledOrders += 1;
      } else if (o.status === 'completed' || o.billPrinted) {
        entry.totalOrders += 1;
        entry.totalSales += Number(o.total || 0);
      }
      map.set(key, entry);
    });
    const arr = Array.from(map.values()).map((g) => ({
      ...g,
      avgOrderValue: g.totalOrders > 0 ? g.totalSales / g.totalOrders : 0,
      orders: g.orders.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    }));
    return arr.sort((a, b) => b.totalSales - a.totalSales);
  }, [orders]);

  const totals = useMemo(
    () => ({
      cashiers: groups.length,
      orders: groups.reduce((s, g) => s + g.totalOrders, 0),
      sales: groups.reduce((s, g) => s + g.totalSales, 0),
      cancelled: groups.reduce((s, g) => s + g.cancelledOrders, 0),
    }),
    [groups]
  );

  const handleExport = () => {
    const headers = ['Cashier', 'Orders', 'Cancelled', 'Total Sales', 'Avg Order Value'];
    const rows = groups.map((g) => [
      g.cashierName,
      g.totalOrders,
      g.cancelledOrders,
      g.totalSales.toFixed(2),
      g.avgOrderValue.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cashier-report.csv';
    a.click();
  };

  const handlePrint = () => {
    printReport(
      {
        title: 'Cashier Report',
        subtitle: 'Sales by cashier',
        dateRange: 'All Time',
      },
      [
        {
          title: 'Summary',
          type: 'stats',
          data: [
            { label: 'Cashiers', value: totals.cashiers },
            { label: 'Total Orders', value: totals.orders },
            { label: 'Cancelled', value: totals.cancelled },
            { label: 'Total Sales', value: formatReportCurrency(totals.sales) },
          ],
        },
        {
          title: 'Cashier Performance',
          type: 'table',
          data: {
            headers: ['Cashier', 'Orders', 'Cancelled', 'Total Sales', 'Avg Order'],
            rows: groups.map((g) => [
              g.cashierName,
              String(g.totalOrders),
              String(g.cancelledOrders),
              formatReportCurrency(g.totalSales),
              formatReportCurrency(g.avgOrderValue),
            ]),
          },
        },
      ]
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Cashier Report</h1>
              <p className="text-sm text-muted-foreground">
                Sales, order count, and full order history per cashier
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="pos-card p-4">
          <div className="text-xs text-muted-foreground">Cashiers</div>
          <div className="text-2xl font-bold">{totals.cashiers}</div>
        </div>
        <div className="pos-card p-4">
          <div className="text-xs text-muted-foreground">Total Orders</div>
          <div className="text-2xl font-bold">{totals.orders}</div>
        </div>
        <div className="pos-card p-4">
          <div className="text-xs text-muted-foreground">Cancelled</div>
          <div className="text-2xl font-bold">{totals.cancelled}</div>
        </div>
        <div className="pos-card p-4">
          <div className="text-xs text-muted-foreground">Total Sales</div>
          <div className="text-2xl font-bold">{formatCurrency(totals.sales)}</div>
        </div>
      </div>

      <div className="pos-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Cashier</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
              <TableHead className="text-right">Total Sales</TableHead>
              <TableHead className="text-right">Avg Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {isLoading ? 'Loading…' : 'No orders found'}
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => {
                const key = g.cashierId || g.cashierName;
                const isOpen = expanded === key;
                return (
                  <React.Fragment key={key}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setExpanded(isOpen ? null : key)}
                    >
                      <TableCell>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{g.cashierName}</TableCell>
                      <TableCell className="text-right">{g.totalOrders}</TableCell>
                      <TableCell className="text-right">{g.cancelledOrders}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(g.totalSales)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(g.avgOrderValue)}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/20 p-0">
                          <div className="p-4">
                            <div className="text-sm font-semibold mb-2">
                              Order History ({g.orders.length})
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Order ID</TableHead>
                                  <TableHead>Date & Time</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead className="text-right">Items</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Payment</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.orders.map((o) => (
                                  <TableRow key={o.id}>
                                    <TableCell className="font-mono">
                                      #{o.id.slice(-6).toUpperCase()}
                                    </TableCell>
                                    <TableCell>
                                      {new Date(o.createdAt).toLocaleString('en-IN')}
                                    </TableCell>
                                    <TableCell className="capitalize">{o.orderType}</TableCell>
                                    <TableCell className="text-right">
                                      {Array.isArray(o.items) ? o.items.length : 0}
                                    </TableCell>
                                    <TableCell className="text-right font-semibold">
                                      {formatCurrency(o.total)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        className={
                                          o.status === 'completed'
                                            ? 'bg-success/20 text-success'
                                            : o.status === 'cancelled'
                                              ? 'bg-destructive/20 text-destructive'
                                              : 'bg-muted text-muted-foreground'
                                        }
                                      >
                                        {o.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="capitalize">
                                      {o.paymentMethod || 'cash'}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CashierReportPage;
