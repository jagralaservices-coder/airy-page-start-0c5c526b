import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateRange } from 'react-day-picker';
import {
  PackageOpen, PackageCheck, ArrowLeft, Search, Download, Printer,
  CheckCircle2, XCircle, AlertTriangle, Filter, Save, FileSpreadsheet,
  Layers, RefreshCw, Sparkles, UserCheck, ChevronDown, Clock, Scale,
  Building2, ShieldCheck, DollarSign, TrendingDown, TrendingUp, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { usePOS } from '@/contexts/POSContext';
import { useLocale } from '@/contexts/LocaleContext';
import { useOwnerStore } from '@/hooks/useOwnerStore';
import { getInventory, InventoryItem, setInventory } from '@/lib/store';
import {
  OpeningAuditRecord, OpeningAuditItem, ClosingAuditRecord, ClosingAuditItem,
  saveOpeningAudit, getOpeningAudits, saveClosingAudit, getClosingAudits, updateClosingAuditStatus
} from '@/lib/checklists/inventoryAuditStore';
import { computeReconciliationItems, computeAuditSummary } from '@/lib/reports/auditEngine';
import { downloadCSV, fmtINR } from '@/lib/reportCsvUtils';
import { printReport } from '@/lib/reportPrintUtils';
import { toast } from 'sonner';

export const OpeningClosingAuditPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const { formatCurrency } = useLocale();
  const { orders } = usePOS();
  const { isOwner, selectedStoreName } = useOwnerStore();

  const initialTab = ((): 'opening' | 'closing' | 'summary' | 'approval' | 'history' => {
    const t = new URLSearchParams(window.location.search).get('t');
    if (t === 'opening') return 'opening';
    if (t === 'closing') return 'closing';
    return 'closing';
  })();
  const [activeTab, setActiveTab] = useState<'opening' | 'closing' | 'summary' | 'approval' | 'history'>(initialTab);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: new Date(),
    to: new Date(),
  }));

  const inventory = useMemo(() => getInventory(), [activeTab]);
  const categories = useMemo(() => {
    const set = new Set(inventory.map((i) => i.category || 'General'));
    return ['all', ...Array.from(set)];
  }, [inventory]);

  // Load Opening Audit for today
  const openingAudits = useMemo(() => getOpeningAudits(), [activeTab]);
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayOpening = useMemo(
    () => openingAudits.find((a) => a.auditDate === todayDateStr) || null,
    [openingAudits, todayDateStr]
  );

  // Editable Opening Stock State
  const [openingItems, setOpeningItems] = useState<OpeningAuditItem[]>(() => {
    if (todayOpening && todayOpening.items) return todayOpening.items;
    return inventory.map((inv) => ({
      productId: String(inv.id),
      productName: inv.name,
      category: inv.category || 'General',
      sku: inv.sku || `SKU-${String(inv.id).slice(0, 6)}`,
      barcode: (inv as any).barcode || `BAR-${String(inv.id).slice(0, 6)}`,
      unit: inv.unit || 'Pcs',
      netWeight: (inv as any).netWeight || 1,
      currentStock: inv.quantity || 0,
      openingQty: inv.quantity || 0,
      openingWeight: ((inv as any).netWeight || 1) * (inv.quantity || 0),
      openingPieces: inv.quantity || 0,
      costPrice: inv.costPerUnit || inv.price || 0,
      sellingPrice: inv.price || 0,
      notes: '',
    }));
  });

  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    category: '',
    subCategory: '',
    brand: '',
    sku: '',
    barcode: '',
    unit: 'Pcs',
    netWeight: '',
    grossWeight: '',
    quantity: '',
    pieces: '',
    boxes: '',
    packets: '',
    bottleCount: '',
    liter: '',
    kilogram: '',
    gram: '',
    milliliter: '',
    costPrice: '',
    sellingPrice: '',
    tax: '',
    mrp: '',
    supplier: '',
    batchNumber: '',
    expiryDate: '',
    manufacturingDate: '',
  });

  const handleAddNewProduct = () => {
    if (!newProduct.name || !newProduct.sku) {
      toast.error('Product Name and SKU are required');
      return;
    }

    const price = parseFloat(newProduct.sellingPrice) || 0;
    const cost = parseFloat(newProduct.costPrice) || 0;
    const qty = parseFloat(newProduct.quantity) || 0;

    const newInvItem: any = {
      id: `INV-${Date.now()}`,
      name: newProduct.name,
      category: newProduct.category || 'General',
      subCategory: newProduct.subCategory,
      brand: newProduct.brand,
      sku: newProduct.sku,
      barcode: newProduct.barcode || `BAR-${Date.now().toString().slice(-6)}`,
      unit: newProduct.unit,
      netWeight: parseFloat(newProduct.netWeight) || 1,
      grossWeight: parseFloat(newProduct.grossWeight) || 1,
      quantity: qty,
      pieces: parseInt(newProduct.pieces) || 0,
      boxes: parseInt(newProduct.boxes) || 0,
      packets: parseInt(newProduct.packets) || 0,
      bottleCount: parseInt(newProduct.bottleCount) || 0,
      liter: parseFloat(newProduct.liter) || 0,
      kilogram: parseFloat(newProduct.kilogram) || 0,
      gram: parseFloat(newProduct.gram) || 0,
      milliliter: parseFloat(newProduct.milliliter) || 0,
      costPerUnit: cost,
      price: price,
      tax: parseFloat(newProduct.tax) || 0,
      mrp: parseFloat(newProduct.mrp) || price,
      supplier: newProduct.supplier,
      batchNumber: newProduct.batchNumber,
      expiryDate: newProduct.expiryDate,
      manufacturingDate: newProduct.manufacturingDate,
      lastUpdated: new Date()
    };

    // Save to global store
    const currentInventory = getInventory();
    const updatedInventory = [newInvItem, ...currentInventory];
    setInventory(updatedInventory);

    // Dynamic append to live states
    const openingItem: OpeningAuditItem = {
      productId: newInvItem.id,
      productName: newInvItem.name,
      category: newInvItem.category,
      sku: newInvItem.sku,
      barcode: newInvItem.barcode,
      unit: newInvItem.unit,
      netWeight: newInvItem.netWeight,
      currentStock: qty,
      openingQty: qty,
      openingPieces: newInvItem.pieces,
      costPrice: cost,
      sellingPrice: price,
      notes: '',
    };
    setOpeningItems(prev => [openingItem, ...prev]);

    const closingItem: ClosingAuditItem = {
      productId: newInvItem.id,
      productName: newInvItem.name,
      sku: newInvItem.sku,
      barcode: newInvItem.barcode,
      category: newInvItem.category,
      unit: newInvItem.unit,
      netWeight: newInvItem.netWeight,
      costPrice: cost,
      sellingPrice: price,
      openingStock: qty,
      purchasedQty: 0,
      returnedQty: 0,
      soldQty: 0,
      wastageQty: 0,
      damagedQty: 0,
      transferInQty: 0,
      transferOutQty: 0,
      expectedClosingStock: qty,
      physicalCount: qty,
      difference: 0,
      weightDifference: 0,
      variancePercent: 0,
      status: 'perfect',
      inventoryLoss: 0,
      inventoryProfit: 0,
    };
    setClosingItems(prev => [closingItem, ...prev]);

    toast.success(`Product "${newProduct.name}" created and added to audit snapshot!`);
    setShowAddProductDialog(false);
    // Reset form
    setNewProduct({
      name: '',
      category: '',
      subCategory: '',
      brand: '',
      sku: '',
      barcode: '',
      unit: 'Pcs',
      netWeight: '',
      grossWeight: '',
      quantity: '',
      pieces: '',
      boxes: '',
      packets: '',
      bottleCount: '',
      liter: '',
      kilogram: '',
      gram: '',
      milliliter: '',
      costPrice: '',
      sellingPrice: '',
      tax: '',
      mrp: '',
      supplier: '',
      batchNumber: '',
      expiryDate: '',
      manufacturingDate: '',
    });
  };

  // Calculate live Reconciliation Items for Closing Report
  const reconciliationItems = useMemo(
    () => computeReconciliationItems(inventory, orders, { fromDate: dateRange?.from, toDate: dateRange?.to }),
    [inventory, orders, dateRange]
  );

  // Editable Closing Stock State
  const [closingItems, setClosingItems] = useState<ClosingAuditItem[]>(reconciliationItems);

  // Synchronize closing items when filters or inventory change
  React.useEffect(() => {
    setClosingItems(reconciliationItems);
  }, [reconciliationItems]);

  const auditSummary = useMemo(() => computeAuditSummary(closingItems), [closingItems]);
  const closingAudits = useMemo(() => getClosingAudits(), [activeTab]);

  // Filtered views
  const filteredOpeningItems = useMemo(() => {
    return openingItems.filter((i) => {
      const matchSearch =
        !search ||
        i.productName.toLowerCase().includes(search.toLowerCase()) ||
        i.sku.toLowerCase().includes(search.toLowerCase()) ||
        i.barcode.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || i.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [openingItems, search, categoryFilter]);

  const filteredClosingItems = useMemo(() => {
    return closingItems.filter((i) => {
      const matchSearch =
        !search ||
        i.productName.toLowerCase().includes(search.toLowerCase()) ||
        i.sku.toLowerCase().includes(search.toLowerCase()) ||
        i.barcode.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || i.category === categoryFilter;
      const matchStatus = statusFilter === 'all' || i.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [closingItems, search, categoryFilter, statusFilter]);

  // Handle Opening Stock Input Change
  const handleOpeningQtyChange = (productId: string, val: number) => {
    setOpeningItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const qty = Math.max(0, val);
          return {
            ...item,
            openingQty: qty,
            openingPieces: qty,
            openingWeight: (item.netWeight || 1) * qty,
          };
        }
        return item;
      })
    );
  };

  // Handle Physical Closing Count Change
  const handleClosingCountChange = (productId: string, count: number) => {
    setClosingItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const physicalCount = Math.max(0, count);
          const diff = physicalCount - item.expectedClosingStock;
          const weightDiff = diff * (item.netWeight || 1);
          const base = item.expectedClosingStock || 1;
          const variance = Math.abs((diff / base) * 100);

          let status: 'perfect' | 'small_diff' | 'large_diff' = 'perfect';
          if (Math.abs(diff) > 0) {
            status = variance >= 5 ? 'large_diff' : 'small_diff';
          }

          const loss = diff < 0 ? Math.abs(diff) * item.costPrice : 0;
          const profit = diff > 0 ? diff * item.costPrice : 0;

          return {
            ...item,
            physicalCount,
            difference: diff,
            weightDifference: weightDiff,
            variancePercent: variance,
            status,
            inventoryLoss: loss,
            inventoryProfit: profit,
          };
        }
        return item;
      })
    );
  };

  // Submit Opening Audit
  const handleSubmitOpening = () => {
    const record: OpeningAuditRecord = {
      id: `OPEN-${Date.now()}`,
      storeId: 'default_store',
      storeName: selectedStoreName || 'Main Store',
      auditDate: todayDateStr,
      openingTime: new Date().toISOString(),
      staffId: 'STAFF-001',
      staffName: 'Counter Manager',
      status: 'submitted',
      items: openingItems,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveOpeningAudit(record);

    // Update main inventory stock to match physical opening count
    const updatedInventory = inventory.map((inv) => {
      const match = openingItems.find((o) => o.productId === String(inv.id));
      if (match) {
        return { ...inv, quantity: match.openingQty };
      }
      return inv;
    });
    setInventory(updatedInventory);

    toast.success('Store Opening Audit Submitted Successfully!');
  };

  // Submit Closing Audit & Reconcile Inventory
  const handleSubmitClosing = () => {
    const hasLargeVariance = closingItems.some((i) => i.status === 'large_diff' || i.inventoryLoss >= 500);
    const status = hasLargeVariance ? 'pending_approval' : 'approved';

    const record: ClosingAuditRecord = {
      id: `CLOSE-${Date.now()}`,
      storeId: 'default_store',
      storeName: selectedStoreName || 'Main Store',
      auditDate: todayDateStr,
      closingTime: new Date().toISOString(),
      staffId: 'STAFF-001',
      staffName: 'Counter Manager',
      status,
      items: closingItems,
      summary: auditSummary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveClosingAudit(record);

    // If auto-approved, update main inventory physical count
    if (status === 'approved') {
      const updatedInventory = inventory.map((inv) => {
        const match = closingItems.find((c) => c.productId === String(inv.id));
        if (match) {
          return { ...inv, quantity: match.physicalCount };
        }
        return inv;
      });
      setInventory(updatedInventory);
      toast.success('Store Closing Audit Approved & Inventory Reconciled!');
    } else {
      toast.warning('Closing Audit Submitted! High stock variance requires Owner Approval.');
    }
  };

  // Export functions
  const handleExport = (type: 'csv' | 'print') => {
    const title = activeTab === 'opening' ? 'Store Opening Audit' : 'Store Closing Reconciliation Report';
    const dateStr = dateRange?.from ? dateRange.from.toLocaleDateString('en-IN') : 'Today';

    if (activeTab === 'opening') {
      const headers = ['Product', 'SKU', 'Barcode', 'Category', 'Unit', 'Opening Qty', 'Net Weight', 'Cost Price', 'Selling Price'];
      const rows = filteredOpeningItems.map((i) => [
        i.productName, i.sku, i.barcode, i.category, i.unit, i.openingQty, i.netWeight || 1, i.costPrice.toFixed(2), i.sellingPrice.toFixed(2),
      ]);
      if (type === 'csv') downloadCSV(`Opening_Stock_Audit_${Date.now()}.csv`, headers, rows);
      else printReport({ title, dateRange: dateStr }, [{ type: 'table', data: { headers, rows } }]);
    } else {
      const headers = ['Product', 'SKU', 'Category', 'Opening', 'Purchased', 'Sold', 'Wastage', 'Expected', 'Physical', 'Diff', 'Variance %', 'Status'];
      const rows = filteredClosingItems.map((i) => [
        i.productName, i.sku, i.category, i.openingStock, i.purchasedQty, i.soldQty, i.wastageQty, i.expectedClosingStock, i.physicalCount, i.difference, `${i.variancePercent.toFixed(1)}%`, i.status.toUpperCase(),
      ]);
      if (type === 'csv') downloadCSV(`Closing_Inventory_Reconciliation_${Date.now()}.csv`, headers, rows);
      else printReport({ title, dateRange: dateStr }, [{ type: 'table', data: { headers, rows } }]);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack ? onBack : () => navigate('/reports')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <PackageCheck className="w-6 h-6 text-primary" />
              Opening & Closing Inventory Reconciliation
            </h1>
            <p className="text-xs text-muted-foreground">
              Enterprise Stock Audit System • Recipe Deductions • Variance Reconciliation • Loss Prevention
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('print')}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 p-1 bg-muted/50 rounded-lg">
          <TabsTrigger value="closing" className="gap-2 text-xs sm:text-sm">
            <PackageCheck className="w-4 h-4 text-emerald-500" />
            Closing Report & Reconciliation
          </TabsTrigger>
          <TabsTrigger value="opening" className="gap-2 text-xs sm:text-sm">
            <PackageOpen className="w-4 h-4 text-blue-500" />
            Opening Report Audit
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-2 text-xs sm:text-sm">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Dashboard Summary
          </TabsTrigger>
          <TabsTrigger value="approval" className="gap-2 text-xs sm:text-sm relative">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            Owner Approvals
            {closingAudits.filter(a => a.status === 'pending_approval').length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0 h-4">
                {closingAudits.filter(a => a.status === 'pending_approval').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 text-xs sm:text-sm">
            <Clock className="w-4 h-4 text-gray-500" />
            Audit History Logs
          </TabsTrigger>
        </TabsList>

        {/* Search & Filters Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search Product, SKU, Barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c === 'all' ? 'All Categories' : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setShowAddProductDialog(true)} variant="outline" className="h-9 text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add Product
            </Button>
          </div>

          {activeTab === 'closing' && (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-9 text-xs">
                  <SelectValue placeholder="Variance Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="perfect">🟢 Perfect Match (0%)</SelectItem>
                  <SelectItem value="small_diff">🟡 Small Diff (&lt;5%)</SelectItem>
                  <SelectItem value="large_diff">🔴 Large Diff (&ge;5%)</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSubmitClosing} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs gap-1.5">
                <Save className="w-3.5 h-3.5" />
                Submit Closing Audit
              </Button>
            </div>
          )}

          {activeTab === 'opening' && (
            <Button onClick={handleSubmitOpening} className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-xs gap-1.5 w-full sm:w-auto">
              <Save className="w-3.5 h-3.5" />
              Submit Store Opening Audit
            </Button>
          )}
        </div>

        {/* Tab 1: Closing Report & Inventory Reconciliation */}
        <TabsContent value="closing" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 border-border bg-card">
              <div className="text-xs text-muted-foreground">Opening Value</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{fmtINR(auditSummary.openingValue)}</div>
            </Card>
            <Card className="p-3 border-border bg-card">
              <div className="text-xs text-muted-foreground">Expected Closing Value</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtINR(auditSummary.closingValue)}</div>
            </Card>
            <Card className="p-3 border-border bg-card">
              <div className="text-xs text-muted-foreground">Inventory Loss (Shortage)</div>
              <div className="text-lg font-bold text-rose-600 dark:text-rose-400">{fmtINR(auditSummary.totalInventoryLoss)}</div>
            </Card>
            <Card className="p-3 border-border bg-card">
              <div className="text-xs text-muted-foreground">Products With Variance</div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{auditSummary.productsWithVariance} / {closingItems.length}</div>
            </Card>
          </div>

          <Card className="border-border overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                  <TableRow>
                    <TableHead>Product / SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead className="text-right">Sold (Direct + Recipe)</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Wastage</TableHead>
                    <TableHead className="text-right">Expected Stock</TableHead>
                    <TableHead className="text-right w-32">Physical Count</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClosingItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        No inventory products match criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClosingItems.map((item) => (
                      <TableRow key={item.productId} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold text-foreground text-xs">{item.productName}</div>
                          <div className="text-[10px] text-muted-foreground">SKU: {item.sku} | Barcode: {item.barcode}</div>
                        </TableCell>
                        <TableCell className="text-xs">{item.category}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{item.openingStock} {item.unit}</TableCell>
                        <TableCell className="text-right text-xs text-blue-500 font-medium">{item.purchasedQty}</TableCell>
                        <TableCell className="text-right text-xs text-emerald-500 font-bold">{item.soldQty}</TableCell>
                        <TableCell className="text-right text-xs text-amber-500">{item.returnedQty}</TableCell>
                        <TableCell className="text-right text-xs text-rose-500">{item.wastageQty}</TableCell>
                        <TableCell className="text-right text-xs font-bold text-foreground">{item.expectedClosingStock} {item.unit}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={item.physicalCount}
                            onChange={(e) => handleClosingCountChange(item.productId, Number(e.target.value))}
                            className="w-24 h-8 text-right font-bold text-xs"
                          />
                        </TableCell>
                        <TableCell className={`text-right text-xs font-bold ${item.difference < 0 ? 'text-rose-600' : item.difference > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {item.difference > 0 ? `+${item.difference}` : item.difference}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          {item.variancePercent.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-center">
                          {item.status === 'perfect' && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px]">
                              🟢 Perfect
                            </Badge>
                          )}
                          {item.status === 'small_diff' && (
                            <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 text-[10px]">
                              🟡 Minor (&lt;5%)
                            </Badge>
                          )}
                          {item.status === 'large_diff' && (
                            <Badge className="bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 text-[10px]">
                              🔴 High Diff
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Opening Report Audit */}
        <TabsContent value="opening" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PackageOpen className="w-4.5 h-4.5 text-blue-500" />
                Store Opening Physical Stock Count ({todayDateStr})
              </CardTitle>
              <CardDescription className="text-xs">
                Auto-populated from active inventory. Staff enters exact opening physical stock count before trading starts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>SKU / Barcode</TableHead>
                    <TableHead className="text-right">Unit Net Weight</TableHead>
                    <TableHead className="text-right">Cost Price</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right w-36">Physical Opening Stock</TableHead>
                    <TableHead className="text-right">Opening Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOpeningItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No active inventory products found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOpeningItems.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell className="font-semibold text-xs text-foreground">{item.productName}</TableCell>
                        <TableCell className="text-xs">{item.category}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.sku} / {item.barcode}</TableCell>
                        <TableCell className="text-right text-xs">{item.netWeight || 1} {item.unit}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{fmtINR(item.costPrice)}</TableCell>
                        <TableCell className="text-right text-xs font-medium text-emerald-600">{fmtINR(item.sellingPrice)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={item.openingQty}
                            onChange={(e) => handleOpeningQtyChange(item.productId, Number(e.target.value))}
                            className="w-28 h-8 text-right font-bold text-xs"
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-foreground">
                          {item.openingWeight || item.openingQty} {item.unit}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Dashboard Summary */}
        <TabsContent value="summary" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-card border-border">
              <div className="text-xs text-muted-foreground mb-1">Opening Stock Value</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{fmtINR(auditSummary.openingValue)}</div>
            </Card>
            <Card className="p-4 bg-card border-border">
              <div className="text-xs text-muted-foreground mb-1">Closing Stock Value</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtINR(auditSummary.closingValue)}</div>
            </Card>
            <Card className="p-4 bg-card border-border">
              <div className="text-xs text-muted-foreground mb-1">Total Sales Revenue</div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{fmtINR(auditSummary.totalSalesValue)}</div>
            </Card>
            <Card className="p-4 bg-card border-border">
              <div className="text-xs text-muted-foreground mb-1">Inventory Shortage Loss</div>
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{fmtINR(auditSummary.totalInventoryLoss)}</div>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-border p-4">
              <CardTitle className="text-sm font-semibold mb-3">Inventory Health & Movement</CardTitle>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Total Sales Units (Direct + Recipe Deductions)</span>
                  <span className="font-bold">{auditSummary.totalSalesQty} Units</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Total Wastage & Damaged Value</span>
                  <span className="font-bold text-rose-500">{fmtINR(auditSummary.totalWastageValue)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Products with Stock Variance</span>
                  <span className="font-bold text-amber-500">{auditSummary.productsWithVariance} Items</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Out of Stock Products</span>
                  <span className="font-bold text-rose-600">{auditSummary.outOfStockProducts} Items</span>
                </div>
              </div>
            </Card>

            <Card className="border-border p-4">
              <CardTitle className="text-sm font-semibold mb-3">Reconciliation Status Breakdown</CardTitle>
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-emerald-500/10 p-3 rounded-lg text-xs">
                  <span className="font-medium text-emerald-600">🟢 Perfect Match (&plusmn;0%)</span>
                  <span className="font-bold text-emerald-600">
                    {closingItems.filter((i) => i.status === 'perfect').length} Products
                  </span>
                </div>
                <div className="flex justify-between items-center bg-amber-500/10 p-3 rounded-lg text-xs">
                  <span className="font-medium text-amber-600">🟡 Minor Variance (&lt;5%)</span>
                  <span className="font-bold text-amber-600">
                    {closingItems.filter((i) => i.status === 'small_diff').length} Products
                  </span>
                </div>
                <div className="flex justify-between items-center bg-rose-500/10 p-3 rounded-lg text-xs">
                  <span className="font-medium text-rose-600">🔴 High Variance (&ge;5%)</span>
                  <span className="font-bold text-rose-600">
                    {closingItems.filter((i) => i.status === 'large_diff').length} Products
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Owner Approvals */}
        <TabsContent value="approval" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4.5 h-4.5 text-amber-500" />
                Closing Audit Approval Queue
              </CardTitle>
              <CardDescription className="text-xs">
                Review inventory closing sessions with high stock variance or loss exceeding threshold.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audit ID</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Submitted By</TableHead>
                    <TableHead className="text-right">Closing Value</TableHead>
                    <TableHead className="text-right">Inventory Loss</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closingAudits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No closing audit sessions currently in queue.
                      </TableCell>
                    </TableRow>
                  ) : (
                    closingAudits.map((audit) => (
                      <TableRow key={audit.id}>
                        <TableCell className="font-bold text-xs">{audit.id}</TableCell>
                        <TableCell className="text-xs">{new Date(audit.closingTime).toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-xs">{audit.staffName}</TableCell>
                        <TableCell className="text-right text-xs font-bold">{fmtINR(audit.summary.closingValue)}</TableCell>
                        <TableCell className="text-right text-xs font-bold text-rose-600">{fmtINR(audit.summary.totalInventoryLoss)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="capitalize text-[10px]">
                            {audit.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {audit.status === 'pending_approval' && (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => {
                                  updateClosingAuditStatus(audit.id, 'approved', 'Owner', 'Approved by owner');
                                  toast.success('Audit Approved!');
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-[11px]"
                                onClick={() => {
                                  updateClosingAuditStatus(audit.id, 'rejected', 'Owner', 'Rejected by owner');
                                  toast.error('Audit Rejected!');
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Audit History Logs */}
        <TabsContent value="history" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4.5 h-4.5 text-gray-500" />
                Audit Logs & Telemetry History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Audit Date</TableHead>
                    <TableHead>Staff Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closingAudits.length === 0 && openingAudits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No audit log history available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    [
                      ...openingAudits.map((a) => ({ ...a, type: 'Opening Audit' })),
                      ...closingAudits.map((a) => ({ ...a, type: 'Closing Audit' })),
                    ].map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-bold text-xs">{log.id}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary" className="text-[10px]">{log.type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.auditDate}</TableCell>
                        <TableCell className="text-xs font-medium">{log.staffName}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] capitalize">{log.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString('en-IN')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Product Dialog */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Add New Product to Inventory & Audit Snapshot
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a new product with complete metrics including subcategories, barcodes, weights, packs, pricing, and batch details.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 text-xs">
            {/* Section 1: General Product Details */}
            <div className="space-y-4 border-r border-border/50 pr-4">
              <h3 className="font-semibold text-primary border-b border-border/50 pb-1 text-sm">General Details</h3>
              
              <div className="space-y-1.5">
                <Label htmlFor="prodName">Product Name *</Label>
                <Input
                  id="prodName"
                  placeholder="e.g. Premium Basmati Rice"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prodSku">SKU *</Label>
                <Input
                  id="prodSku"
                  placeholder="e.g. RICE-BAS-001"
                  value={newProduct.sku}
                  onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prodBarcode">Barcode</Label>
                <Input
                  id="prodBarcode"
                  placeholder="Scan or enter barcode"
                  value={newProduct.barcode}
                  onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodCategory">Category</Label>
                  <Input
                    id="prodCategory"
                    placeholder="e.g. Grains"
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodSubCategory">Sub Category</Label>
                  <Input
                    id="prodSubCategory"
                    placeholder="e.g. Rice"
                    value={newProduct.subCategory}
                    onChange={(e) => setNewProduct({ ...newProduct, subCategory: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prodBrand">Brand</Label>
                <Input
                  id="prodBrand"
                  placeholder="e.g. India Gate"
                  value={newProduct.brand}
                  onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodUnit">Base Unit</Label>
                  <Select value={newProduct.unit} onValueChange={(val) => setNewProduct({ ...newProduct, unit: val })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pcs">Pieces (Pcs)</SelectItem>
                      <SelectItem value="Kg">Kilograms (Kg)</SelectItem>
                      <SelectItem value="Gram">Grams (g)</SelectItem>
                      <SelectItem value="Liter">Liters (Ltr)</SelectItem>
                      <SelectItem value="Ml">Milliliters (ml)</SelectItem>
                      <SelectItem value="Boxes">Boxes</SelectItem>
                      <SelectItem value="Packets">Packets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodSupplier">Supplier</Label>
                  <Input
                    id="prodSupplier"
                    placeholder="Supplier Name"
                    value={newProduct.supplier}
                    onChange={(e) => setNewProduct({ ...newProduct, supplier: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Weight & Package Counts */}
            <div className="space-y-4 border-r border-border/50 px-4">
              <h3 className="font-semibold text-primary border-b border-border/50 pb-1 text-sm">Weights & Pack Counts</h3>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodNetWeight">Net Weight</Label>
                  <Input
                    id="prodNetWeight"
                    type="number"
                    placeholder="e.g. 5"
                    value={newProduct.netWeight}
                    onChange={(e) => setNewProduct({ ...newProduct, netWeight: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodGrossWeight">Gross Weight</Label>
                  <Input
                    id="prodGrossWeight"
                    type="number"
                    placeholder="e.g. 5.2"
                    value={newProduct.grossWeight}
                    onChange={(e) => setNewProduct({ ...newProduct, grossWeight: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodPieces">Pieces</Label>
                  <Input
                    id="prodPieces"
                    type="number"
                    placeholder="Count"
                    value={newProduct.pieces}
                    onChange={(e) => setNewProduct({ ...newProduct, pieces: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodBoxes">Boxes</Label>
                  <Input
                    id="prodBoxes"
                    type="number"
                    placeholder="Count"
                    value={newProduct.boxes}
                    onChange={(e) => setNewProduct({ ...newProduct, boxes: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodPackets">Packets</Label>
                  <Input
                    id="prodPackets"
                    type="number"
                    placeholder="Count"
                    value={newProduct.packets}
                    onChange={(e) => setNewProduct({ ...newProduct, packets: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodBottleCount">Bottle Count</Label>
                  <Input
                    id="prodBottleCount"
                    type="number"
                    placeholder="Count"
                    value={newProduct.bottleCount}
                    onChange={(e) => setNewProduct({ ...newProduct, bottleCount: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodQty">Starting Quantity</Label>
                  <Input
                    id="prodQty"
                    type="number"
                    placeholder="Current Stock"
                    value={newProduct.quantity}
                    onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
                    className="h-8 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodLiter">Liters (L)</Label>
                  <Input
                    id="prodLiter"
                    type="number"
                    placeholder="Ltr"
                    value={newProduct.liter}
                    onChange={(e) => setNewProduct({ ...newProduct, liter: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodKg">Kilograms (Kg)</Label>
                  <Input
                    id="prodKg"
                    type="number"
                    placeholder="Kg"
                    value={newProduct.kilogram}
                    onChange={(e) => setNewProduct({ ...newProduct, kilogram: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodGram">Grams (g)</Label>
                  <Input
                    id="prodGram"
                    type="number"
                    placeholder="g"
                    value={newProduct.gram}
                    onChange={(e) => setNewProduct({ ...newProduct, gram: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodMl">Milliliters (ml)</Label>
                  <Input
                    id="prodMl"
                    type="number"
                    placeholder="ml"
                    value={newProduct.milliliter}
                    onChange={(e) => setNewProduct({ ...newProduct, milliliter: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Cost, Pricing & Batches */}
            <div className="space-y-4 pl-4">
              <h3 className="font-semibold text-primary border-b border-border/50 pb-1 text-sm">Pricing & Batch Dates</h3>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodCost">Cost Price</Label>
                  <Input
                    id="prodCost"
                    type="number"
                    placeholder="Cost per unit"
                    value={newProduct.costPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, costPrice: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodSelling">Selling Price</Label>
                  <Input
                    id="prodSelling"
                    type="number"
                    placeholder="Selling price"
                    value={newProduct.sellingPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, sellingPrice: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodTax">Tax (%)</Label>
                  <Input
                    id="prodTax"
                    type="number"
                    placeholder="GST %"
                    value={newProduct.tax}
                    onChange={(e) => setNewProduct({ ...newProduct, tax: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodMrp">MRP</Label>
                  <Input
                    id="prodMrp"
                    type="number"
                    placeholder="MRP price"
                    value={newProduct.mrp}
                    onChange={(e) => setNewProduct({ ...newProduct, mrp: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prodBatch">Batch Number</Label>
                <Input
                  id="prodBatch"
                  placeholder="e.g. BATCH-A9"
                  value={newProduct.batchNumber}
                  onChange={(e) => setNewProduct({ ...newProduct, batchNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prodMfgDate">Mfg Date</Label>
                  <Input
                    id="prodMfgDate"
                    type="date"
                    value={newProduct.manufacturingDate}
                    onChange={(e) => setNewProduct({ ...newProduct, manufacturingDate: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodExpiry">Expiry Date</Label>
                  <Input
                    id="prodExpiry"
                    type="date"
                    value={newProduct.expiryDate}
                    onChange={(e) => setNewProduct({ ...newProduct, expiryDate: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dialog Footer Actions */}
          <div className="flex justify-end gap-2 border-t border-border/50 pt-4">
            <Button variant="outline" className="h-9 text-xs" onClick={() => setShowAddProductDialog(false)}>
              Cancel
            </Button>
            <Button className="h-9 text-xs bg-primary hover:bg-primary/95 text-primary-foreground" onClick={handleAddNewProduct}>
              Save & Append Product
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OpeningClosingAuditPage;
