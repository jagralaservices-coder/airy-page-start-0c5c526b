import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, Plus, Loader2, ReceiptText, Wallet, BadgeCheck,
  AlertTriangle, RefreshCw, FileText, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getCurrentStoreId } from '@/hooks/useCloudData';
import {
  searchOrders, processReturn, fetchReturns, fetchCreditNotes,
  REASON_OPTIONS, REFUND_METHODS,
  ReturnReason, ReturnType, RefundMethod, SearchedOrder, ReturnLineInput,
} from '@/lib/salesReturns';

const fmt = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface StoreCfg {
  return_refund_pin_threshold: number;
  return_allow_exchange: boolean;
  return_allow_credit_note: boolean;
}

const SalesReturnsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const storeId = getCurrentStoreId() || '';

  const [tab, setTab] = useState('new');
  const [returns, setReturns] = useState<any[]>([]);
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [cfg, setCfg] = useState<StoreCfg>({
    return_refund_pin_threshold: 0,
    return_allow_exchange: true,
    return_allow_credit_note: true,
  });

  // search & selection
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedOrder[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchedOrder | null>(null);

  // line state keyed by index
  const [lineState, setLineState] = useState<Record<number, { qty: number; selected: boolean; restock: boolean; damaged: boolean }>>({});

  const [reason, setReason] = useState<ReturnReason>('damaged');
  const [reasonNotes, setReasonNotes] = useState('');
  const [returnType, setReturnType] = useState<ReturnType>('refund');
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');
  const [creditExpiry, setCreditExpiry] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);

  // PIN gate
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);

  // Load config + lists
  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const { data } = await supabase.from('stores')
        .select('return_refund_pin_threshold, return_allow_exchange, return_allow_credit_note')
        .eq('id', storeId).maybeSingle();
      if (data) setCfg(data as any);
      try { setReturns(await fetchReturns(storeId)); } catch { /* ignore */ }
      try { setCreditNotes(await fetchCreditNotes(storeId)); } catch { /* ignore */ }
    })();
  }, [storeId]);

  // Realtime refresh
  useEffect(() => {
    if (!storeId) return;
    const ch = supabase.channel('sales-returns-' + storeId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_returns', filter: `store_id=eq.${storeId}` },
        async () => { try { setReturns(await fetchReturns(storeId)); } catch {} })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_notes', filter: `store_id=eq.${storeId}` },
        async () => { try { setCreditNotes(await fetchCreditNotes(storeId)); } catch {} })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId]);

  const handleSearch = async () => {
    if (!storeId) { toast.error('No active store'); return; }
    setSearching(true);
    try {
      const r = await searchOrders(query, storeId);
      setResults(r);
      if (!r.length) toast.message('No bills found');
    } catch (e: any) {
      toast.error(e?.message || 'Search failed');
    } finally { setSearching(false); }
  };

  const openOrder = (o: SearchedOrder) => {
    setSelected(o);
    const init: typeof lineState = {};
    o.items.forEach((l, i) => {
      init[i] = { qty: l.quantity, selected: false, restock: true, damaged: false };
    });
    setLineState(init);
  };

  const updateLine = (i: number, patch: Partial<{ qty: number; selected: boolean; restock: boolean; damaged: boolean }>) => {
    setLineState(prev => ({ ...prev, [i]: { ...prev[i], ...patch } }));
  };

  const linesToReturn: ReturnLineInput[] = useMemo(() => {
    if (!selected) return [];
    return selected.items
      .map((l, i) => {
        const s = lineState[i];
        if (!s?.selected || s.qty <= 0) return null;
        return {
          product_id: l.product_id,
          name: l.name,
          category: l.category || null,
          unit_price: l.unit_price,
          quantity: Math.min(s.qty, l.quantity),
          restock: !!s.restock && !s.damaged,
          damaged: !!s.damaged,
        } as ReturnLineInput;
      })
      .filter((x): x is ReturnLineInput => !!x);
  }, [selected, lineState]);

  const returnTotal = useMemo(
    () => linesToReturn.reduce((s, l) => s + l.unit_price * l.quantity, 0),
    [linesToReturn],
  );

  const needsPin = returnType !== 'exchange' && cfg.return_refund_pin_threshold > 0 && returnTotal > cfg.return_refund_pin_threshold;

  const resetForm = () => {
    setSelected(null); setQuery(''); setResults([]); setLineState({});
    setReason('damaged'); setReasonNotes(''); setReturnType('refund'); setRefundMethod('cash'); setCreditExpiry('');
  };

  const doSubmit = async (approvedBy?: string) => {
    if (!selected) return;
    if (!linesToReturn.length) { toast.error('Select at least one line'); return; }
    setSubmitting(true);
    try {
      const res = await processReturn({
        storeId,
        originalOrder: selected,
        lines: linesToReturn,
        reason,
        reasonNotes,
        returnType,
        refundMethod: returnType === 'refund' ? refundMethod : undefined,
        creditNoteExpiry: returnType === 'credit_note' && creditExpiry ? new Date(creditExpiry).toISOString() : null,
        cashierName: user?.email || null,
        approvedBy: approvedBy || null,
      });
      toast.success(`Return ${res.returnNo} saved`);
      resetForm();
      setTab('list');
      try { setReturns(await fetchReturns(storeId)); } catch {}
      if (returnType === 'credit_note') {
        try { setCreditNotes(await fetchCreditNotes(storeId)); } catch {}
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save return');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitClick = () => {
    if (!selected) return;
    if (!linesToReturn.length) { toast.error('Select at least one line'); return; }
    if (returnType === 'exchange' && !cfg.return_allow_exchange) { toast.error('Exchanges disabled for this store'); return; }
    if (returnType === 'credit_note' && !cfg.return_allow_credit_note) { toast.error('Credit notes disabled for this store'); return; }
    if (needsPin) { setPinOpen(true); return; }
    void doSubmit();
  };

  const verifyPinAndSubmit = async () => {
    if (!pin || !user?.email) return;
    setPinVerifying(true); setPinError('');
    try {
      const { data, error } = await supabase.functions.invoke('verify-user-password', {
        body: { password: pin, email: user.email },
      });
      if (error || !data?.valid) {
        setPinError('Invalid password / PIN'); setPinVerifying(false); return;
      }
      setPinOpen(false); setPin('');
      await doSubmit(user.id);
    } catch {
      setPinError('Verification failed');
    } finally { setPinVerifying(false); }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Sales Return & Refund Center</h1>
              <p className="text-sm text-muted-foreground">Returns, refunds, exchanges and credit notes</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/reports/sales-returns')}>
            <FileText className="w-4 h-4 mr-1" /> Open Report
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="new"><Plus className="w-4 h-4 mr-1" />New Return</TabsTrigger>
            <TabsTrigger value="list"><ReceiptText className="w-4 h-4 mr-1" />Returns ({returns.length})</TabsTrigger>
            <TabsTrigger value="credits"><Wallet className="w-4 h-4 mr-1" />Credit Notes ({creditNotes.length})</TabsTrigger>
          </TabsList>

          {/* ============== NEW RETURN ============== */}
          <TabsContent value="new" className="space-y-4">
            <Card className="p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by invoice no / phone / customer"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                />
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="ml-1">Search</span>
                </Button>
              </div>

              {results.length > 0 && !selected && (
                <div className="mt-3 border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.order_number || o.bill_number || o.id.slice(0,8)}</TableCell>
                          <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{o.customer_name || '—'} {o.customer_phone && <span className="text-muted-foreground">({o.customer_phone})</span>}</TableCell>
                          <TableCell className="text-xs uppercase">{o.payment_method || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(o.total)}</TableCell>
                          <TableCell><Button size="sm" onClick={() => openOrder(o)}>Select</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>

            {selected && (
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Invoice</div>
                    <div className="font-mono font-semibold">{selected.order_number || selected.bill_number}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {selected.customer_name || 'Walk-in'} {selected.customer_phone && `• ${selected.customer_phone}`}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetForm}>
                    <RefreshCw className="w-4 h-4 mr-1" />Change bill
                  </Button>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Sold Qty</TableHead>
                        <TableHead className="text-center w-28">Return Qty</TableHead>
                        <TableHead className="text-center">Restock</TableHead>
                        <TableHead className="text-center">Damaged</TableHead>
                        <TableHead className="text-right">Line Refund</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.items.map((l, i) => {
                        const s = lineState[i] || { qty: l.quantity, selected: false, restock: true, damaged: false };
                        return (
                          <TableRow key={i} className={s.selected ? 'bg-primary/5' : ''}>
                            <TableCell>
                              <Checkbox checked={s.selected} onCheckedChange={(v) => updateLine(i, { selected: !!v })} />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{l.name}</div>
                              {l.category && <div className="text-xs text-muted-foreground">{l.category}</div>}
                            </TableCell>
                            <TableCell className="text-right text-sm">{fmt(l.unit_price)}</TableCell>
                            <TableCell className="text-right text-sm">{l.quantity}</TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number" min={0} max={l.quantity} step="0.001"
                                disabled={!s.selected}
                                value={s.qty}
                                onChange={e => updateLine(i, { qty: Math.max(0, Math.min(l.quantity, Number(e.target.value) || 0)) })}
                                className="h-8 w-20 text-center mx-auto"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox disabled={!s.selected || s.damaged} checked={s.restock && !s.damaged} onCheckedChange={(v) => updateLine(i, { restock: !!v })} />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox disabled={!s.selected} checked={s.damaged} onCheckedChange={(v) => updateLine(i, { damaged: !!v, restock: !v && s.restock })} />
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {s.selected ? fmt(l.unit_price * s.qty) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label>Return Reason</Label>
                    <Select value={reason} onValueChange={(v) => setReason(v as ReturnReason)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REASON_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Return Type</Label>
                    <Select value={returnType} onValueChange={(v) => setReturnType(v as ReturnType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="refund">Refund Money</SelectItem>
                        <SelectItem value="exchange" disabled={!cfg.return_allow_exchange}>Exchange Product</SelectItem>
                        <SelectItem value="credit_note" disabled={!cfg.return_allow_credit_note}>Credit Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {returnType === 'refund' && (
                    <div>
                      <Label>Refund Method</Label>
                      <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as RefundMethod)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REFUND_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {returnType === 'credit_note' && (
                    <div>
                      <Label>Credit Note Expiry (optional)</Label>
                      <Input type="date" value={creditExpiry} onChange={e => setCreditExpiry(e.target.value)} />
                    </div>
                  )}
                  {returnType === 'exchange' && (
                    <div className="md:col-span-1">
                      <Label>Exchange Note</Label>
                      <div className="text-xs text-muted-foreground p-2 border rounded">
                        Process the exchange sale at billing; the price difference will reconcile against this return amount.
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} value={reasonNotes} onChange={e => setReasonNotes(e.target.value)} placeholder="Optional context for audit log" />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Return Total</div>
                    <div className="text-2xl font-bold">{fmt(returnTotal)}</div>
                    {needsPin && (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="w-3 h-3" /> PIN approval required (over {fmt(cfg.return_refund_pin_threshold)})
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetForm} disabled={submitting}>Cancel</Button>
                    <Button onClick={onSubmitClick} disabled={submitting || !linesToReturn.length}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BadgeCheck className="w-4 h-4 mr-1" />}
                      Complete Return
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ============== RETURNS LIST ============== */}
          <TabsContent value="list">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return No</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No returns yet</TableCell></TableRow>
                  )}
                  {returns.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.return_no}</TableCell>
                      <TableCell className="font-mono text-xs">{r.original_invoice_no || '—'}</TableCell>
                      <TableCell className="text-xs">{r.customer_name || 'Walk-in'}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{r.return_type || 'partial'}</Badge></TableCell>
                      <TableCell className="text-xs capitalize">{(r.reason || '').replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-xs uppercase">{r.refund_method || '—'}</TableCell>
                      <TableCell className="text-right">{fmt(Number(r.refund_amount) || 0)}</TableCell>
                      <TableCell className="text-right">{fmt(Number(r.credit_note_amount) || 0)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(r.return_amount) || 0)}</TableCell>
                      <TableCell className="text-xs">{new Date(r.returned_at || r.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* ============== CREDIT NOTES ============== */}
          <TabsContent value="credits">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Note No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>From Invoice</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Redeemed</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditNotes.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No credit notes</TableCell></TableRow>
                  )}
                  {creditNotes.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.note_no}</TableCell>
                      <TableCell className="text-xs">{c.customer_name || 'Walk-in'} {c.customer_phone && <span className="text-muted-foreground">({c.customer_phone})</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{c.original_invoice_no || '—'}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.issued_amount) || 0)}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.redeemed_amount) || 0)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(c.balance_amount) || 0)}</TableCell>
                      <TableCell className="text-xs">{c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* PIN dialog */}
      <Dialog open={pinOpen} onOpenChange={(o) => { if (!o) { setPin(''); setPinError(''); } setPinOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Manager Approval Required
            </DialogTitle>
            <DialogDescription>
              Refund of {fmt(returnTotal)} exceeds the configured threshold ({fmt(cfg.return_refund_pin_threshold)}).
              Enter your account password to approve.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Password / PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') verifyPinAndSubmit(); }}
            autoFocus
          />
          {pinError && <p className="text-sm text-destructive">{pinError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinOpen(false)} disabled={pinVerifying}>Cancel</Button>
            <Button onClick={verifyPinAndSubmit} disabled={!pin || pinVerifying}>
              {pinVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              Approve & Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesReturnsPage;
