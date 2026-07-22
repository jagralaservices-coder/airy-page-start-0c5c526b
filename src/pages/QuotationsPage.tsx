import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Edit, Check, X, FileText, Printer, Mail, MessageCircle, ShoppingCart, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useOwnerStore } from '@/hooks/useOwnerStore';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getCurrentStoreId } from '@/lib/storeIdentity';
import {
  Quotation, QuotationItem, QuotationStatus, STATUS_COLORS,
  listQuotations, saveQuotation, deleteQuotation, setQuotationStatus,
  generateQuotationNo, computeItemTotal, computeTotals, expireOldQuotations, getQuotation,
} from '@/lib/quotations';
import { printReport } from '@/lib/reports/exporters';

const EMPTY_ITEM: QuotationItem = { product_name: '', quantity: 1, price: 0, discount: 0, tax_rate: 0, tax_amount: 0, total: 0 };

const QuotationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const { isOwner } = useOwnerStore();
  const [rows, setRows] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [editing, setEditing] = useState<Quotation | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([{ ...EMPTY_ITEM }]);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const storeId = getCurrentStoreId();

  const load = async () => {
    setLoading(true);
    try {
      await expireOldQuotations();
      const data = await listQuotations(isOwner ? 'all' : (storeId ? [storeId] : []));
      setRows(data);
    } catch (e: any) {
      toast({ title: 'Failed to load quotations', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.quotation_no?.toLowerCase().includes(s) || r.customer_name?.toLowerCase().includes(s) || r.customer_phone?.includes(s);
    }
    return true;
  }), [rows, search, statusFilter]);

  const openNew = () => {
    if (!storeId && !isOwner) { toast({ title: 'Select a store first', variant: 'destructive' }); return; }
    const sid = storeId || '';
    setEditing({
      store_id: sid,
      quotation_no: generateQuotationNo(),
      status: 'draft',
      subtotal: 0, discount: 0, tax: 0, grand_total: 0,
      expiry_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      salesperson_id: user?.id || null,
      salesperson_name: (user as any)?.user_metadata?.full_name || user?.email || null,
    });
    setItems([{ ...EMPTY_ITEM }]);
  };

  const openEdit = async (q: Quotation) => {
    try {
      const full = await getQuotation(q.id!);
      setEditing(full);
      setItems(full.items?.length ? full.items : [{ ...EMPTY_ITEM }]);
    } catch (e: any) { toast({ title: 'Load failed', description: e.message, variant: 'destructive' }); }
  };

  const updateItem = (idx: number, patch: Partial<QuotationItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? computeItemTotal({ ...it, ...patch }) : it));
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.store_id) { toast({ title: 'Store missing', variant: 'destructive' }); return; }
    const cleanItems = items.filter(i => i.product_name && i.quantity > 0).map(computeItemTotal);
    if (!cleanItems.length) { toast({ title: 'Add at least one product', variant: 'destructive' }); return; }
    try {
      await saveQuotation(editing, cleanItems);
      toast({ title: 'Quotation saved' });
      setEditing(null);
      load();
    } catch (e: any) { toast({ title: 'Save failed', description: e.message, variant: 'destructive' }); }
  };

  const handleStatus = async (id: string, status: QuotationStatus, extra: any = {}) => {
    try {
      await setQuotationStatus(id, status, extra);
      toast({ title: `Marked ${status}` });
      load();
    } catch (e: any) { toast({ title: 'Action failed', description: e.message, variant: 'destructive' }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quotation?')) return;
    try { await deleteQuotation(id); toast({ title: 'Deleted' }); load(); }
    catch (e: any) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  const buildPayload = async (q: Quotation) => {
    const full = await getQuotation(q.id!);
    return {
      title: `Quotation ${q.quotation_no}`,
      subtitle: q.customer_name || '',
      dateRange: `Expiry: ${q.expiry_date?.slice(0, 10) || '-'}`,
      storeName: '',
      kpis: [
        { label: 'Subtotal', value: q.subtotal.toFixed(2) },
        { label: 'Discount', value: q.discount.toFixed(2) },
        { label: 'Tax', value: q.tax.toFixed(2) },
        { label: 'Grand Total', value: q.grand_total.toFixed(2) },
      ],
      sections: [{
        title: 'Items',
        headers: ['Product', 'Qty', 'Price', 'Discount', 'Tax', 'Total'],
        rows: (full.items || []).map(i => [i.product_name, i.quantity, i.price, i.discount, i.tax_amount, i.total]),
      }],
    };
  };

  const handlePrint = async (q: Quotation) => printReport(await buildPayload(q));

  const handleEmail = (q: Quotation) => {
    const subj = encodeURIComponent(`Quotation ${q.quotation_no}`);
    const body = encodeURIComponent(`Hi ${q.customer_name || ''},\n\nPlease find quotation ${q.quotation_no} — Grand Total: ${q.grand_total}\nValid until: ${q.expiry_date?.slice(0,10) || '-'}\n\nThank you.`);
    window.open(`mailto:${q.customer_email || ''}?subject=${subj}&body=${body}`);
  };

  const handleWhatsapp = (q: Quotation) => {
    const phone = (q.customer_phone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(`Quotation ${q.quotation_no}\nTotal: ${q.grand_total}\nValid until: ${q.expiry_date?.slice(0,10) || '-'}`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const convert = async (q: Quotation) => {
    await handleStatus(q.id!, 'converted', { converted_order_id: null });
    toast({ title: 'Converted', description: 'Marked as converted. Use POS to create the invoice.' });
  };

  const exportCSV = () => {
    const headers = ['Quotation No', 'Date', 'Customer', 'Phone', 'Salesperson', 'Status', 'Grand Total', 'Expiry'];
    const lines = [headers.join(',')];
    const esc = (v: any) => '"' + String(v ?? '').split('"').join('""') + '"';
    filtered.forEach(r => {
      const cells = [r.quotation_no, r.created_at?.slice(0, 10), r.customer_name || '', r.customer_phone || '', r.salesperson_name || '', r.status, r.grand_total, r.expiry_date?.slice(0, 10) || ''];
      lines.push(cells.map(esc).join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `quotations_${Date.now()}.csv`; a.click();
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Quotations</h1>
          <p className="text-sm text-muted-foreground">Create, approve and convert quotations to invoices.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
        <Button size="sm" onClick={openNew} className="bg-primary"><Plus className="h-4 w-4 mr-1" />New Quotation</Button>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Search</Label>
          <Input placeholder="Quote no / customer / phone" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="w-44">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Salesperson</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No quotations</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.quotation_no}</TableCell>
                <TableCell className="text-xs">{r.created_at?.slice(0, 10)}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{r.customer_name || '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_phone}</div>
                </TableCell>
                <TableCell className="text-xs">{r.salesperson_name || '—'}</TableCell>
                <TableCell><Badge className={`${STATUS_COLORS[r.status]} text-white capitalize`}>{r.status}</Badge></TableCell>
                <TableCell className="text-xs">{r.expiry_date?.slice(0, 10) || '—'}</TableCell>
                <TableCell className="text-right font-semibold">{r.grand_total.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1 flex-wrap">
                    <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
                    {(r.status === 'draft' || r.status === 'pending') && (
                      <>
                        <Button size="icon" variant="ghost" title="Approve" onClick={() => handleStatus(r.id!, 'approved')}><Check className="h-4 w-4 text-emerald-600" /></Button>
                        <Button size="icon" variant="ghost" title="Reject" onClick={() => { setRejectOpen(r.id!); setRejectReason(''); }}><X className="h-4 w-4 text-rose-600" /></Button>
                      </>
                    )}
                    {r.status === 'approved' && (
                      <Button size="icon" variant="ghost" title="Convert" onClick={() => convert(r)}><ShoppingCart className="h-4 w-4 text-primary" /></Button>
                    )}
                    <Button size="icon" variant="ghost" title="Print" onClick={() => handlePrint(r)}><Printer className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Email" onClick={() => handleEmail(r)}><Mail className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="WhatsApp" onClick={() => handleWhatsapp(r)}><MessageCircle className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Delete" onClick={() => handleDelete(r.id!)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit' : 'New'} Quotation</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><Label className="text-xs">Quotation No</Label><Input value={editing.quotation_no} onChange={e => setEditing({ ...editing, quotation_no: e.target.value })} /></div>
                <div><Label className="text-xs">Status</Label>
                  <Select value={editing.status} onValueChange={(v: any) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['draft','pending','approved','rejected','expired','converted'] as QuotationStatus[]).map(s =>
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Expiry Date</Label><Input type="date" value={editing.expiry_date?.slice(0, 10) || ''} onChange={e => setEditing({ ...editing, expiry_date: e.target.value })} /></div>
                <div><Label className="text-xs">Customer Name</Label><Input value={editing.customer_name || ''} onChange={e => setEditing({ ...editing, customer_name: e.target.value })} /></div>
                <div><Label className="text-xs">Phone</Label><Input value={editing.customer_phone || ''} onChange={e => setEditing({ ...editing, customer_phone: e.target.value })} /></div>
                <div><Label className="text-xs">Email</Label><Input value={editing.customer_email || ''} onChange={e => setEditing({ ...editing, customer_email: e.target.value })} /></div>
                <div><Label className="text-xs">Salesperson</Label><Input value={editing.salesperson_name || ''} onChange={e => setEditing({ ...editing, salesperson_name: e.target.value })} /></div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Items</Label>
                  <Button size="sm" variant="outline" onClick={() => setItems([...items, { ...EMPTY_ITEM }])}><Plus className="h-3 w-3 mr-1" />Add Item</Button>
                </div>
                <div className="border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="w-20">Qty</TableHead>
                        <TableHead className="w-24">Price</TableHead>
                        <TableHead className="w-24">Discount</TableHead>
                        <TableHead className="w-20">Tax%</TableHead>
                        <TableHead className="w-24 text-right">Total</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell><Input value={it.product_name} onChange={e => updateItem(i, { product_name: e.target.value })} placeholder="Product name" /></TableCell>
                          <TableCell><Input type="number" value={it.quantity} onChange={e => updateItem(i, { quantity: +e.target.value })} /></TableCell>
                          <TableCell><Input type="number" value={it.price} onChange={e => updateItem(i, { price: +e.target.value })} /></TableCell>
                          <TableCell><Input type="number" value={it.discount} onChange={e => updateItem(i, { discount: +e.target.value })} /></TableCell>
                          <TableCell><Input type="number" value={it.tax_rate} onChange={e => updateItem(i, { tax_rate: +e.target.value })} /></TableCell>
                          <TableCell className="text-right font-semibold">{it.total.toFixed(2)}</TableCell>
                          <TableCell><Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-rose-600" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-sm">
                {(() => { const t = computeTotals(items.map(computeItemTotal)); return (
                  <>
                    <div className="bg-muted/40 rounded p-2"><div className="text-xs text-muted-foreground">Subtotal</div><div className="font-bold">{t.subtotal.toFixed(2)}</div></div>
                    <div className="bg-muted/40 rounded p-2"><div className="text-xs text-muted-foreground">Discount</div><div className="font-bold">{t.discount.toFixed(2)}</div></div>
                    <div className="bg-muted/40 rounded p-2"><div className="text-xs text-muted-foreground">Tax</div><div className="font-bold">{t.tax.toFixed(2)}</div></div>
                    <div className="bg-primary/10 rounded p-2"><div className="text-xs text-muted-foreground">Grand Total</div><div className="font-bold text-primary">{t.grand_total.toFixed(2)}</div></div>
                  </>); })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
                <div><Label className="text-xs">Terms</Label><Textarea rows={2} value={editing.terms || ''} onChange={e => setEditing({ ...editing, terms: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} className="bg-primary">Save Quotation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason */}
      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Quotation</DialogTitle></DialogHeader>
          <Textarea rows={3} placeholder="Reason for rejection" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => { if (rejectOpen) { await handleStatus(rejectOpen, 'rejected', { rejection_reason: rejectReason }); setRejectOpen(null); } }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuotationsPage;
