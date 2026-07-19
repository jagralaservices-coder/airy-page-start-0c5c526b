import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';

const TYPE_LABELS: Record<string, string> = {
  purchase: 'Purchase (In)',
  usage: 'Sale / Consumption (Out)',
  production: 'Production (In)',
};

const StockLedgerPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);

  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);
  const inventoryList = useMemo(() => readInventory(), []);

  const items = useMemo(() => Array.from(new Set(history.map(h => h.inventoryName))).sort(), [history]);

  const rows = useMemo(() => {
    // Sort ascending to compute running balance per item
    const asc = [...history].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const running = new Map<string, number>();
    // seed from current inventory minus net movement in future — approximation: start at 0 and accumulate.
    const enriched = asc.map(h => {
      const opening = running.get(h.inventoryId) ?? 0;
      const isIn = h.type === 'purchase' || h.type === 'production';
      const qty = Math.abs(h.quantity);
      const closing = opening + (isIn ? qty : -qty);
      running.set(h.inventoryId, closing);
      return { ...h, opening, inQty: isIn ? qty : 0, outQty: isIn ? 0 : qty, closing };
    });
    return enriched
      .filter(r => inRange(r.createdAt, range))
      .filter(r => typeFilter === 'all' || r.type === typeFilter)
      .filter(r => itemFilter === 'all' || r.inventoryId === itemFilter)
      .filter(r => !search || r.inventoryName.toLowerCase().includes(search.toLowerCase()) || (r.billNumber || '').toLowerCase().includes(search.toLowerCase()))
      .reverse();
  }, [history, range, typeFilter, itemFilter, search]);

  const totalIn = rows.reduce((s, r) => s + r.inQty, 0);
  const totalOut = rows.reduce((s, r) => s + r.outQty, 0);
  const totalValue = rows.reduce((s, r) => s + (r.totalCost || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Stock Ledger"
        subtitle="Item-level movement register"
        icon={<Package className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="usage">Consumption</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
            <Select value={itemFilter} onValueChange={setItemFilter}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Item" /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="all">All Items</SelectItem>
                {items.map(n => <SelectItem key={n} value={inventoryList.find(i => i.name === n)?.id || n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
        buildPayload={() => ({
          title: 'Stock Ledger',
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          storeName: scope.storeName,
          kpis: [
            { label: 'Total In', value: fmt(totalIn) },
            { label: 'Total Out', value: fmt(totalOut) },
            { label: 'Net Movement', value: fmt(totalIn - totalOut) },
            { label: 'Purchase Value', value: fmtINR(totalValue) },
          ],
          sections: [{
            title: 'Movements',
            headers: ['Date', 'Item', 'Type', 'Opening', 'In', 'Out', 'Closing', 'Ref', 'By'],
            rows: rows.map(r => [
              new Date(r.createdAt).toLocaleString('en-IN'),
              r.inventoryName,
              TYPE_LABELS[r.type] || r.type,
              fmt(r.opening), fmt(r.inQty), fmt(r.outQty), fmt(r.closing),
              r.billNumber || r.orderId || r.source || '-',
              r.createdBy || '-',
            ]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total In</div><div className="text-lg font-bold">{fmt(totalIn)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Out</div><div className="text-lg font-bold">{fmt(totalOut)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Net</div><div className="text-lg font-bold">{fmt(totalIn - totalOut)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Purchase Value</div><div className="text-lg font-bold">{fmtINR(totalValue)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Type</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead>Ref</TableHead><TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No movements in this range</TableCell></TableRow>
                ) : rows.slice(0, 500).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="font-medium">{r.inventoryName}</TableCell>
                    <TableCell>
                      <Badge variant={r.type === 'usage' ? 'destructive' : r.type === 'production' ? 'secondary' : 'default'}>{TYPE_LABELS[r.type] || r.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmt(r.opening)}</TableCell>
                    <TableCell className="text-right text-success">{r.inQty ? fmt(r.inQty) : '-'}</TableCell>
                    <TableCell className="text-right text-destructive">{r.outQty ? fmt(r.outQty) : '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.closing)}</TableCell>
                    <TableCell className="text-xs">{r.billNumber || r.source || '-'}</TableCell>
                    <TableCell className="text-xs">{r.createdBy || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 500 && <div className="text-center py-3 text-xs text-muted-foreground">Showing first 500 of {rows.length} rows — use filters to narrow.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StockLedgerPage;
