import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useFeatureToggles } from '@/hooks/useFeatureToggles';
import { useGatewayConnections, GatewayConnection } from '@/hooks/useGatewayConnections';
import { GATEWAY_CATALOG, getCatalogEntry, paymentHub } from '@/lib/paymentHub';
import { useToast } from '@/hooks/use-toast';
import { Copy, Plug, Power, RefreshCw, Trash2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const PaymentIntegrationsPage: React.FC = () => {
  const { toggles, updateToggle } = useFeatureToggles();
  const { connections, loading, upsert, remove, toggle, reload } = useGatewayConnections();
  const { toast } = useToast();
  const [dialogGateway, setDialogGateway] = useState<string | null>(null);
  const [editing, setEditing] = useState<GatewayConnection | null>(null);
  const [form, setForm] = useState<any>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const autoMode = toggles.paymentGatewayEnabled;

  const openConnect = (gatewayId: string) => {
    const existing = connections.find(c => c.gateway_id === gatewayId);
    setEditing(existing || null);
    setForm(existing ? {
      display_name: existing.display_name || '',
      merchant_account_id: existing.merchant_account_id || '',
      api_key: existing.api_key || '',
      secretKey: '',
      webhookSecret: '',
      environment: existing.environment,
    } : { environment: 'sandbox' });
    setDialogGateway(gatewayId);
  };

  const save = async () => {
    if (!dialogGateway) return;
    const entry = getCatalogEntry(dialogGateway);
    // Validate required fields
    const missing = (entry?.fields || []).filter(f => f.required && !form[f.key]).map(f => f.label);
    if (missing.length) {
      toast({ title: 'Missing fields', description: `Please fill: ${missing.join(', ')}`, variant: 'destructive' });
      return;
    }
    try {
      await upsert({
        id: editing?.id,
        gateway_id: dialogGateway,
        display_name: form.display_name,
        merchant_account_id: form.merchant_account_id || null,
        api_key: form.api_key || null,
        webhook_secret: form.webhookSecret || null,
        secretKey: form.secretKey,
        environment: form.environment,
        enabled: true,
      } as any);
      toast({ title: 'Connection saved', description: 'Run Test Connection to verify.' });
      setDialogGateway(null);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };


  const test = async (c: GatewayConnection) => {
    setBusyId(c.id);
    try {
      const r = await paymentHub.testConnection(c.id);
      toast({ title: r.ok ? 'Connection OK' : 'Connection failed', description: r.message, variant: r.ok ? 'default' : 'destructive' });
      reload();
    } catch (e: any) {
      toast({ title: 'Test failed', description: e.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: 'Webhook URL copied' });
  };

  const StatusBadge: React.FC<{ s: string }> = ({ s }) => {
    if (s === 'connected') return <Badge className="bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>;
    if (s === 'error') return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Disconnected</Badge>;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Payment Integrations</h1>
        <p className="text-muted-foreground">Connect payment gateways for automatic payment confirmation. Manual mode remains default.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Payment Mode</span>
            <div className="flex items-center gap-3">
              <span className={`text-sm ${!autoMode ? 'font-semibold' : 'text-muted-foreground'}`}>Manual</span>
              <Switch checked={autoMode} onCheckedChange={(v) => updateToggle('paymentGatewayEnabled', v)} />
              <span className={`text-sm ${autoMode ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>Auto Gateway</span>
            </div>
          </CardTitle>
          <CardDescription>
            {autoMode
              ? 'Auto mode: connected gateways can auto-confirm payments. Manual fallback always available.'
              : 'Manual mode: cashiers confirm payments. Auto gateway features are hidden.'}
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="gateways">
        <TabsList>
          <TabsTrigger value="gateways">Gateways</TabsTrigger>
          <TabsTrigger value="connections">My Connections ({connections.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="gateways" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {GATEWAY_CATALOG.map((g) => {
            const conn = connections.find(c => c.gateway_id === g.id);
            return (
              <Card key={g.id} className={!autoMode ? 'opacity-60' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="text-2xl">{g.logo}</span>{g.name}
                    </span>
                    {g.status === 'coming_soon'
                      ? <Badge variant="outline">Coming soon</Badge>
                      : conn ? <StatusBadge s={conn.status} /> : <Badge variant="outline">Not connected</Badge>}
                  </CardTitle>
                  <CardDescription>{g.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1 text-xs">
                    {g.supports.dynamicQR && <Badge variant="secondary">Dynamic QR</Badge>}
                    {g.supports.staticQR && <Badge variant="secondary">Static QR</Badge>}
                    {g.supports.refunds && <Badge variant="secondary">Refunds</Badge>}
                    {g.supports.settlement && <Badge variant="secondary">Settlement</Badge>}
                  </div>
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={!autoMode || g.status === 'coming_soon'}
                    onClick={() => openConnect(g.id)}
                  >
                    <Plug className="w-4 h-4" /> {conn ? 'Edit' : 'Connect'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="connections" className="space-y-3 mt-4">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && connections.length === 0 && (
            <p className="text-sm text-muted-foreground">No gateways connected yet.</p>
          )}
          {connections.map((c) => {
            const meta = getCatalogEntry(c.gateway_id);
            return (
              <Card key={c.id}>
                <CardContent className="p-4 flex flex-wrap items-center gap-4 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{meta?.logo}</span>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.display_name || meta?.name}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 items-center">
                        <Badge variant="outline" className="text-[10px]">{c.environment}</Badge>
                        <StatusBadge s={c.status} />
                        {c.last_sync_at && <span>· Last sync {new Date(c.last_sync_at).toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.webhook_url && (
                      <Button size="sm" variant="ghost" onClick={() => copyUrl(c.webhook_url!)}>
                        <Copy className="w-3 h-3" /> Webhook
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => test(c)}>
                      <RefreshCw className={`w-3 h-3 ${busyId === c.id ? 'animate-spin' : ''}`} /> Test
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(c.id, !c.enabled)}>
                      <Power className="w-3 h-3" /> {c.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openConnect(c.gateway_id)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Connect dialog */}
      <Dialog open={!!dialogGateway} onOpenChange={(o) => !o && setDialogGateway(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit' : 'Connect'} {dialogGateway && getCatalogEntry(dialogGateway)?.name}
            </DialogTitle>
          </DialogHeader>
          {dialogGateway && (
            <div className="space-y-3">
              <div>
                <Label>Display Name</Label>
                <Input value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="e.g. Main Store - Razorpay" />
              </div>
              <div>
                <Label>Environment</Label>
                <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {getCatalogEntry(dialogGateway)?.fields.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}{f.required && ' *'}</Label>
                  <Input
                    type={f.type === 'password' ? 'password' : 'text'}
                    value={form[f.key] || ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.type === 'password' ? '••••••••' : ''}
                  />
                </div>
              ))}
              {editing?.webhook_url && (
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-1">Webhook URL (paste into gateway dashboard)</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs flex-1 truncate">{editing.webhook_url}</code>
                    <Button size="sm" variant="ghost" onClick={() => copyUrl(editing.webhook_url!)}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogGateway(null)}>Cancel</Button>
            <Button onClick={save}>Save Connection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentIntegrationsPage;
