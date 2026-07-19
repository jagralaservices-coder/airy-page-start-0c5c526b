import React, { useEffect, useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, inRange } from '@/lib/reports/invPurchHelpers';

interface AdjustmentRow {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  adjustmentType: string;
  quantity: number;
  reason: string;
  adjustedBy: string;
  storeId: string;
}

const StockAdjustmentReportPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [reasonFilter, setReasonFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const range = presetToRange(preset, customRange);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from('stock_adjustments').select('id, product_id, adjustment_type, quantity, reason, adjusted_by, created_at, store_id, products(name)')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (scope.storeId) q = q.eq('store_id', scope.storeId);
      const { data, error } = await q;
      if (!error && data) {
        setRows(data.map((r: any) => ({
          id: r.id,
          createdAt: r.created_at,
          productId: r.product_id,
          productName: r.products?.name || '—',
          adjustmentType: r.adjustment_type,
          quantity: Number(r.quantity),
          reason: r.reason || '-',
          adjustedBy: r.adjusted_by || '-',
          storeId: r.store_id,
        })));
      }
      setLoading(false);
    })();
  }, [scope.storeId]);

  const filtered = useMemo(() => rows
    .filter(r => inRange(r.createdAt, range))
    .filter(r => reasonFilter === 'all' || r.reason === reasonFilter)
    .filter(r => typeFilter === 'all' || r.adjustmentType === typeFilter)
    .filter(r => !search || r.productName.toLowerCase().includes(search.toLowerCase())),
    [rows, range, reasonFilter, typeFilter, search]);

  const reasons = useMemo(() => Array.from(new Set(rows.map(r => r.reason).filter(Boolean))), [rows]);
  const totalIn = filtered.filter(r => r.quantity > 0).reduce((s, r) => s + r.quantity, 0);
  const totalOut = filtered.filter(r => r.quantity < 0).reduce((s, r) => s + Math.abs(r.quantity), 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Stock Adjustment Report"
        subtitle="Manual inventory corrections"
        icon={<Wrench className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="add">Add</SelectItem>
                <SelectItem value="remove">Remove</SelectItem>
                <SelectItem value="set">Set</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Reason" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Reasons</SelectItem>
                {reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
        buildPayload={() => ({
          title: 'Stock Adjustment Report',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Adjustments', value: filtered.length },
            { label: 'Total Added', value: fmt(totalIn) },
            { label: 'Total Removed', value: fmt(totalOut) },
          ],
          sections: [{
            title: 'Adjustments',
            headers: ['Date', 'Item', 'Type', 'Qty', 'Reason', 'By'],
            rows: filtered.map(r => [new Date(r.createdAt).toLocaleString('en-IN'), r.productName, r.adjustmentType, fmt(r.quantity), r.reason, r.adjustedBy]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Adjustments</div><div className="text-lg font-bold">{filtered.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Added</div><div className="text-lg font-bold text-success">{fmt(totalIn)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Removed</div><div className="text-lg font-bold text-destructive">{fmt(totalOut)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reason</TableHead><TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">Loading…</TableCell></TableRow>
                  : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No adjustments</TableCell></TableRow>
                  : filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="font-medium">{r.productName}</TableCell>
                      <TableCell><Badge variant="outline">{r.adjustmentType}</Badge></TableCell>
                      <TableCell className={`text-right font-semibold ${r.quantity < 0 ? 'text-destructive' : 'text-success'}`}>{fmt(r.quantity)}</TableCell>
                      <TableCell className="text-xs">{r.reason}</TableCell>
                      <TableCell className="text-xs">{r.adjustedBy}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StockAdjustmentReportPage;
