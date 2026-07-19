import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { paymentHub } from '@/lib/paymentHub';
import { useGatewayConnections } from '@/hooks/useGatewayConnections';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  amount: number;
  orderId?: string;
  storeId: string;
  onPaid: (info: { gatewayId: string; gatewayTxnId: string; transactionId: string }) => void;
  onManualFallback: () => void;
}

export const AutoPaymentDialog: React.FC<Props> = ({ open, onOpenChange, amount, orderId, storeId, onPaid, onManualFallback }) => {
  const { connections } = useGatewayConnections();
  const active = connections.filter(c => c.enabled && c.status === 'connected');
  const [selected, setSelected] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [txn, setTxn] = useState<{ id: string; qr: string; gatewayTxnId: string } | null>(null);
  const [qrImg, setQrImg] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'paid' | 'failed'>('idle');
  const pollRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (active.length && !selected) setSelected(active[0].id);
  }, [active, selected]);

  useEffect(() => {
    if (!open) {
      setTxn(null); setStatus('idle'); setQrImg('');
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [open]);

  const startCharge = async () => {
    if (!selected) return;
    setCreating(true);
    try {
      const r = await paymentHub.createCharge(selected, { orderId: orderId || '', storeId, amount });
      setTxn({ id: r.transactionId, qr: r.qrPayload || '', gatewayTxnId: r.gatewayTxnId });
      setStatus('pending');
      // QR rendered inline via <QRCodeCanvas>

      // Poll + realtime
      pollRef.current = window.setInterval(async () => {
        try {
          const v = await paymentHub.verifyPayment(r.transactionId);
          if (v.status === 'paid') {
            setStatus('paid');
            if (pollRef.current) clearInterval(pollRef.current);
            onPaid({ gatewayId: active.find(c => c.id === selected)!.gateway_id, gatewayTxnId: v.gatewayTxnId, transactionId: r.transactionId });
          } else if (['failed', 'cancelled', 'expired'].includes(v.status)) {
            setStatus('failed');
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {}
      }, 3000);

      // Realtime listener as fast-path
      const ch = supabase
        .channel(`gw-txn-${r.transactionId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gateway_transactions', filter: `id=eq.${r.transactionId}` },
          (payload: any) => {
            if (payload.new?.status === 'paid') {
              setStatus('paid');
              onPaid({ gatewayId: payload.new.gateway_id, gatewayTxnId: payload.new.gateway_txn_id, transactionId: r.transactionId });
            }
          })
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    } catch (e: any) {
      toast({ title: 'Charge failed', description: e.message, variant: 'destructive' });
      setStatus('failed');
    } finally { setCreating(false); }
  };

  const simulatePaid = async () => {
    if (!txn) return;
    // Dev/manual confirmation when no real webhook arrives — marks as paid.
    await (supabase as any).from('gateway_transactions').update({ status: 'paid' }).eq('id', txn.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Auto Payment</DialogTitle>
        </DialogHeader>

        {active.length === 0 ? (
          <div className="space-y-3 text-center py-6">
            <p className="text-sm text-muted-foreground">No active payment gateway. Continue manually.</p>
            <Button onClick={onManualFallback}>Switch to Manual</Button>
          </div>
        ) : !txn ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Choose Gateway</label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {active.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.display_name || c.gateway_id} · {c.environment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-2xl font-bold text-center">₹{amount.toFixed(2)}</div>
            <Button onClick={startCharge} disabled={creating || !selected} className="w-full">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Generate Payment QR
            </Button>
            <Button variant="ghost" onClick={onManualFallback} className="w-full">Pay Manually Instead</Button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <Badge variant={status === 'paid' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'}>
              {status === 'pending' && <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Waiting for payment…</>}
              {status === 'paid' && <><CheckCircle2 className="w-3 h-3 mr-1" />Payment Received</>}
              {status === 'failed' && <><XCircle className="w-3 h-3 mr-1" />Payment Failed</>}
            </Badge>
            {txn.qr && <div className="flex justify-center"><QRCodeCanvas value={txn.qr} size={240} includeMargin /></div>}
            <div className="text-2xl font-bold">₹{amount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground break-all">Ref: {txn.gatewayTxnId}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onManualFallback}>Manual Fallback</Button>
              <Button variant="secondary" className="flex-1" onClick={simulatePaid}>I Received Payment</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
