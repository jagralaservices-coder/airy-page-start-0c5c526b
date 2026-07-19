import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, MapPin, User as UserIcon, Calendar, Star, Search,
  Printer, FileText, FileSpreadsheet, FileDown, Plus, Trash2, Crown, Clock,
  TrendingUp, TrendingDown, AlertCircle, Sparkles, Edit2, ShoppingCart, Wallet,
  MessageCircle, Ban, Award, Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getCustomers, setCustomers, getOrders, getCreditLedger, getCreditPayments, Order, Customer } from '@/lib/store';
import KpiCard from '@/components/reports/KpiCard';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Area, AreaChart } from 'recharts';
import { exportCSV, exportExcel, exportPDF, printReport, ReportPayload } from '@/lib/reports/exporters';

const normalizePhone = (p: string | null | undefined) => (p || '').replace(/\D/g, '').trim();
const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--accent))', '#8b5cf6', '#06b6d4', '#f59e0b'];

interface CustomerNote { id: string; text: string; tag?: string; createdAt: string; createdBy?: string; }
interface CustomerDoc { id: string; name: string; type: string; dataUrl: string; uploadedAt: string; }
interface TimelineEvent { id: string; type: string; label: string; date: string; meta?: string; tone?: 'primary'|'success'|'warning'|'destructive'|'muted'; }
interface CustomerExtras {
  altPhone?: string; city?: string; state?: string; country?: string; pincode?: string;
  pan?: string; company?: string; notes?: string; status?: 'Active'|'Inactive'|'Blocked';
  creditLimit?: number; photoUrl?: string;
}

const notesKey = (id: string) => `pos_customer_notes_${id}`;
const docsKey = (id: string) => `pos_customer_docs_${id}`;
const typeKey = (id: string) => `pos_customer_type_${id}`;
const gstKey = (id: string) => `pos_customer_gst_${id}`;
const extrasKey = (id: string) => `pos_customer_extras_${id}`;

const tierFor = (orders: number, spend: number): 'Silver'|'Gold'|'Diamond'|'—' => {
  if (orders >= 50 || spend >= 100000) return 'Diamond';
  if (orders >= 20 || spend >= 25000) return 'Gold';
  if (orders >= 5) return 'Silver';
  return '—';
};

const CustomerProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: customerId } = useParams<{ id: string }>();
  const { formatCurrency } = useLocale();
  const { isOwner, isSuperAdmin, isAdmin } = useSupabaseAuth();
  const canSeeMultiStore = isOwner() || isSuperAdmin() || isAdmin();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [docs, setDocs] = useState<CustomerDoc[]>([]);
  const [customerType, setCustomerType] = useState<string>('Regular');
  const [gstNumber, setGstNumber] = useState<string>('');
  const [extras, setExtras] = useState<CustomerExtras>({});
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [noteText, setNoteText] = useState(''); const [noteTag, setNoteTag] = useState('');
  const [search, setSearch] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!customerId) return;
    const c = getCustomers().find(x => x.id === customerId);
    setCustomer(c || null);
    const phoneNorm = normalizePhone(c?.phone);
    const allOrders = getOrders().filter(o => o.customerId === customerId || (phoneNorm && normalizePhone(o.customerPhone) === phoneNorm));
    setOrders(allOrders.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    try { setNotes(JSON.parse(localStorage.getItem(notesKey(customerId)) || '[]')); } catch {}
    try { setDocs(JSON.parse(localStorage.getItem(docsKey(customerId)) || '[]')); } catch {}
    try { setExtras(JSON.parse(localStorage.getItem(extrasKey(customerId)) || '{}')); } catch {}
    setCustomerType(localStorage.getItem(typeKey(customerId)) || 'Regular');
    setGstNumber(localStorage.getItem(gstKey(customerId)) || '');
  }, [customerId]);

  const credit = useMemo(() => {
    if (!customerId) return { entries: [], payments: [], outstanding: 0, totalDue: 0, totalPaid: 0 };
    const entries = getCreditLedger().filter(e => e.customer_id === customerId || (customer?.phone && normalizePhone(e.customer_phone) === normalizePhone(customer.phone)));
    const ids = new Set(entries.map(e => e.id));
    const payments = getCreditPayments().filter(p => ids.has(p.credit_ledger_id || p.credit_id || ''));
    const totalDue = entries.reduce((s,e) => s + (e.due_amount || 0), 0);
    const totalPaid = entries.reduce((s,e) => s + (e.paid_amount || 0), 0);
    return { entries, payments, outstanding: totalDue - totalPaid, totalDue, totalPaid };
  }, [customerId, customer]);

  const completed = orders.filter(o => o.status !== 'cancelled');
  const totalSales = completed.reduce((s,o) => s + (o.total || 0), 0);
  const totalDiscount = completed.reduce((s,o) => s + (o.discount || 0), 0);
  const totalTax = completed.reduce((s,o) => s + (o.tax || 0), 0);
  const totalQty = completed.reduce((s,o) => s + o.items.reduce((x,i) => x + (i.quantity||0), 0), 0);
  const avgBill = completed.length ? totalSales / completed.length : 0;
  const avgItemsPerBill = completed.length ? totalQty / completed.length : 0;
  const highestBill = completed.reduce((m,o) => Math.max(m, o.total || 0), 0);
  const lowestBill = completed.length ? completed.reduce((m,o) => Math.min(m, o.total || Infinity), Infinity) : 0;
  const lastVisit = orders[0]?.createdAt ? new Date(orders[0].createdAt) : null;
  const creditLimit = extras.creditLimit || 0;
  const availableCredit = Math.max(0, creditLimit - credit.outstanding);
  const loyaltyPoints = Math.floor(totalSales / 100);
  const tier = tierFor(completed.length, totalSales);
  const status = extras.status || 'Active';

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (search) {
        const s = search.toLowerCase();
        if (!(o.billNumber||'').toLowerCase().includes(s) && !(o.id||'').toLowerCase().includes(s)) return false;
      }
      if (orderTypeFilter !== 'all' && o.orderType !== orderTypeFilter) return false;
      if (paymentFilter !== 'all' && o.paymentMethod !== paymentFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      const d = new Date(o.createdAt).getTime();
      if (dateFrom && d < new Date(dateFrom).getTime()) return false;
      if (dateTo && d > new Date(dateTo).getTime() + 86400000) return false;
      return true;
    });
  }, [orders, search, orderTypeFilter, paymentFilter, statusFilter, dateFrom, dateTo]);

  const analytics = useMemo(() => {
    const productMap = new Map<string, { qty: number; revenue: number; }>();
    const categoryMap = new Map<string, number>();
    const paymentMap = new Map<string, number>();
    const monthMap = new Map<string, number>();
    const yearMap = new Map<string, number>();
    const paymentTrendMap = new Map<string, Record<string, number>>();
    const dayMap: Record<string, number> = { Sun:0, Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0 };
    const hourMap: Record<number, number> = {};
    completed.forEach(o => {
      o.items.forEach(i => {
        const cur = productMap.get(i.name) || { qty: 0, revenue: 0 };
        cur.qty += i.quantity; cur.revenue += i.price * i.quantity;
        productMap.set(i.name, cur);
        categoryMap.set(i.category || 'Other', (categoryMap.get(i.category || 'Other') || 0) + i.price * i.quantity);
      });
      const pm = o.paymentMethod || 'unknown';
      if (o.paymentBreakdown) {
        Object.entries(o.paymentBreakdown).forEach(([k,v]) => paymentMap.set(k, (paymentMap.get(k)||0) + (v as number)));
      } else paymentMap.set(pm, (paymentMap.get(pm)||0) + o.total);
      const d = new Date(o.createdAt);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthMap.set(monthKey, (monthMap.get(monthKey)||0) + o.total);
      yearMap.set(String(d.getFullYear()), (yearMap.get(String(d.getFullYear()))||0) + o.total);
      const ptm = paymentTrendMap.get(monthKey) || {};
      ptm[pm] = (ptm[pm] || 0) + o.total;
      paymentTrendMap.set(monthKey, ptm);
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      dayMap[dayName] += o.total;
      hourMap[d.getHours()] = (hourMap[d.getHours()] || 0) + 1;
    });
    let returnedOrders = 0, refundAmount = 0;
    orders.forEach(o => { if (o.status === 'cancelled') { returnedOrders++; refundAmount += o.total; } });
    const topProducts = [...productMap.entries()].sort((a,b) => b[1].qty - a[1].qty);
    const topCategories = [...categoryMap.entries()].sort((a,b) => b[1] - a[1]);
    const peakHour = Object.entries(hourMap).sort((a,b) => b[1] - a[1])[0];
    const peakDay = Object.entries(dayMap).sort((a,b) => b[1] - a[1])[0];
    const dates = completed.map(o => new Date(o.createdAt).getTime()).sort((a,b)=>a-b);
    let avgGap = 0;
    if (dates.length > 1) { let sum = 0; for (let i=1;i<dates.length;i++) sum += dates[i]-dates[i-1]; avgGap = sum / (dates.length-1) / 86400000; }
    const purchaseFrequency = avgGap > 0 ? (30 / avgGap) : 0;
    const preferredPayment = [...paymentMap.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
    const monthSeries = [...monthMap.entries()].sort().map(([k,v]) => ({ month: k, revenue: v }));
    const paymentMethods = Array.from(new Set(completed.map(o => o.paymentMethod || 'unknown')));
    const paymentTrendSeries = [...paymentTrendMap.entries()].sort().map(([k, v]) => ({ month: k, ...v }));
    return {
      favoriteProduct: topProducts[0]?.[0] || '—',
      favoriteCategory: topCategories[0]?.[0] || '—',
      topProducts: topProducts.slice(0,5),
      topCategories: topCategories.slice(0,6),
      paymentMap, monthSeries,
      yearSeries: [...yearMap.entries()].sort().map(([k,v]) => ({ year: k, revenue: v })),
      paymentTrendSeries, paymentMethods,
      daySeries: Object.entries(dayMap).map(([k,v]) => ({ day: k, revenue: v })),
      peakHour: peakHour ? `${peakHour[0]}:00` : '—',
      peakDay: peakDay?.[0] || '—',
      avgGap, purchaseFrequency, preferredPayment, returnedOrders, refundAmount,
    };
  }, [completed, orders]);

  const insights = useMemo(() => {
    const out: { tone: 'primary'|'success'|'warning'|'destructive'; icon: any; text: string; }[] = [];
    const daysSinceVisit = lastVisit ? (Date.now() - lastVisit.getTime())/86400000 : Infinity;
    if (daysSinceVisit > 45) out.push({ tone:'warning', icon: AlertCircle, text: `Customer has not visited for ${Math.round(daysSinceVisit)} days. Send a re-engagement offer.` });
    if (totalSales > 25000) out.push({ tone:'success', icon: Crown, text: `High Value Customer — lifetime spend ${formatCurrency(totalSales)}.` });
    if (credit.outstanding > 0) out.push({ tone:'destructive', icon: AlertCircle, text: `Outstanding credit of ${formatCurrency(credit.outstanding)} — recommend collection.` });
    const ms = analytics.monthSeries;
    if (ms.length >= 2) {
      const last = ms[ms.length-1].revenue, prev = ms[ms.length-2].revenue;
      if (prev > 0) {
        const delta = ((last - prev) / prev) * 100;
        if (delta >= 15) out.push({ tone:'success', icon: TrendingUp, text: `Spending increased by ${delta.toFixed(0)}% vs last month.` });
        else if (delta <= -15) out.push({ tone:'warning', icon: TrendingDown, text: `Spending dropped by ${Math.abs(delta).toFixed(0)}% vs last month — likely to become inactive.` });
      }
    }
    if (analytics.peakDay !== '—' && analytics.favoriteProduct !== '—') out.push({ tone:'primary', icon: Sparkles, text: `Usually purchases ${analytics.favoriteProduct} on ${analytics.peakDay}.` });
    if (analytics.preferredPayment !== '—') out.push({ tone:'primary', icon: Wallet, text: `Usually pays using ${analytics.preferredPayment.toUpperCase()}.` });
    if (completed.length >= 10 && customerType !== 'VIP') out.push({ tone:'primary', icon: Star, text: `Recommend upgrade to VIP — ${completed.length} orders placed.` });
    return out;
  }, [lastVisit, totalSales, credit, analytics, completed, customerType, formatCurrency]);

  const timeline: TimelineEvent[] = useMemo(() => {
    const ev: TimelineEvent[] = [];
    if (customer) ev.push({ id:'c', type:'created', label:'Customer Created', date: String(customer.createdAt), tone:'primary' });
    const sorted = [...orders].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sorted[0]) ev.push({ id:'first', type:'first', label:'First Purchase', date: String(sorted[0].createdAt), meta: formatCurrency(sorted[0].total), tone:'success' });
    if (sorted.length > 1) { const l = sorted[sorted.length-1]; ev.push({ id:'last', type:'last', label:'Latest Purchase', date: String(l.createdAt), meta: formatCurrency(l.total), tone:'primary' }); }
    credit.entries.forEach(e => ev.push({ id:'ce-'+e.id, type:'credit', label:'Credit Given', date: String(e.created_at), meta: formatCurrency(e.due_amount), tone:'warning' }));
    credit.payments.forEach(p => ev.push({ id:'cp-'+p.id, type:'paid', label:'Credit Paid', date: String(p.created_at), meta: formatCurrency(p.amount), tone:'success' }));
    orders.filter(o => o.status === 'cancelled').forEach(o => ev.push({ id:'cn-'+o.id, type:'cancel', label:'Order Cancelled', date: String(o.createdAt), meta: o.billNumber, tone:'destructive' }));
    notes.forEach(n => ev.push({ id:'n-'+n.id, type:'note', label:'Note Added', date: n.createdAt, meta: n.text.slice(0,40), tone:'muted' as any }));
    return ev.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [customer, orders, credit, notes, formatCurrency]);

  const persistExtras = (next: CustomerExtras) => {
    if (!customerId) return;
    setExtras(next);
    localStorage.setItem(extrasKey(customerId), JSON.stringify(next));
  };

  const saveCustomerEdit = (patch: Partial<Customer>, ex: CustomerExtras) => {
    if (!customer) return;
    const updated = { ...customer, ...patch, lastUpdated: new Date().toISOString(), pendingSync: true } as Customer;
    setCustomer(updated);
    setCustomers(getCustomers().map(c => c.id === updated.id ? updated : c));
    persistExtras(ex);
    toast.success('Customer updated');
    setShowEditDialog(false);
  };

  const addNote = () => {
    if (!noteText.trim() || !customerId) return;
    const note: CustomerNote = { id: crypto.randomUUID(), text: noteText.trim(), tag: noteTag.trim() || undefined, createdAt: new Date().toISOString() };
    const next = [note, ...notes]; setNotes(next); localStorage.setItem(notesKey(customerId), JSON.stringify(next));
    setNoteText(''); setNoteTag(''); setShowNoteDialog(false); toast.success('Note added');
  };
  const removeNote = (id: string) => { if (!customerId) return; const next = notes.filter(n => n.id !== id); setNotes(next); localStorage.setItem(notesKey(customerId), JSON.stringify(next)); };
  const onUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0]; if (!file || !customerId) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Max 2MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const doc: CustomerDoc = { id: crypto.randomUUID(), name: file.name, type, dataUrl: String(reader.result), uploadedAt: new Date().toISOString() };
      const next = [doc, ...docs]; setDocs(next); localStorage.setItem(docsKey(customerId), JSON.stringify(next));
      toast.success(`${type} uploaded`);
    };
    reader.readAsDataURL(file);
  };
  const removeDoc = (id: string) => { if (!customerId) return; const next = docs.filter(d => d.id !== id); setDocs(next); localStorage.setItem(docsKey(customerId), JSON.stringify(next)); };
  const saveType = (t: string) => { if (!customerId) return; setCustomerType(t); localStorage.setItem(typeKey(customerId), t); };
  const saveGst = (g: string) => { if (!customerId) return; setGstNumber(g); localStorage.setItem(gstKey(customerId), g); };

  const buildPayload = (): ReportPayload => ({
    title: `Customer Statement - ${customer?.name || ''}`,
    subtitle: `${customer?.phone || ''} • ${customerType} • ${status}`,
    sections: [{
      title: 'Order History',
      headers: ['Invoice','Date','Type','Payment','Discount','Tax','Net','Status', ...(canSeeMultiStore?['Outlet']:[])],
      rows: filteredOrders.map(o => [o.billNumber||'—', new Date(o.createdAt).toLocaleString(), o.orderType, o.paymentMethod||'—', o.discount||0, o.tax||0, o.total, o.status, ...(canSeeMultiStore?[(o.storeId||'—').slice(0,8)]:[])])
    }]
  });

  const callCustomer = () => { if (customer?.phone) window.open(`tel:${customer.phone}`); };
  const whatsappCustomer = () => { if (customer?.phone) window.open(`https://wa.me/${normalizePhone(customer.phone)}`, '_blank'); };
  const emailCustomer = () => { if (customer?.email) window.open(`mailto:${customer.email}`); else toast.error('No email on file'); };
  const newSale = () => { try { localStorage.setItem('pos_prefill_customer', JSON.stringify({ id: customer?.id, name: customer?.name, phone: customer?.phone })); } catch {} navigate('/pos'); };
  const toggleVip = () => { saveType(customerType === 'VIP' ? 'Regular' : 'VIP'); toast.success(customerType === 'VIP' ? 'Removed VIP' : 'Marked as VIP'); };
  const toggleBlock = () => { const ns = status === 'Blocked' ? 'Active' : 'Blocked'; persistExtras({ ...extras, status: ns }); toast.success(`Customer ${ns}`); };

  if (!customer) {
    return <div className="p-8 text-center text-muted-foreground">Customer not found. <Button variant="link" onClick={() => navigate('/customers')}>Back</Button></div>;
  }

  const paymentChart = [...analytics.paymentMap.entries()].map(([k,v]) => ({ name: k, value: v }));
  const statusColor = status === 'Active' ? 'bg-success/10 text-success border-success/30' : status === 'Blocked' ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-muted text-muted-foreground';

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-muted rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 overflow-hidden">
            {extras.photoUrl ? <img src={extras.photoUrl} alt="" className="w-full h-full object-cover" /> : (customer.name || '?').slice(0,1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate">{customer.name}</h1>
              <Badge variant="secondary" className="gap-1"><Crown className="w-3 h-3" />{customerType}</Badge>
              <Badge className={statusColor} variant="outline">{status}</Badge>
              {tier !== '—' && <Badge variant="outline" className="gap-1"><Award className="w-3 h-3" />{tier}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">ID {customer.id.slice(0,8)} • Since {new Date(customer.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        {/* Quick Actions */}
        <div className="px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <Button size="sm" variant="outline" onClick={() => setShowEditDialog(true)}><Edit2 className="w-4 h-4 mr-1" />Edit</Button>
            <Button size="sm" onClick={newSale}><ShoppingCart className="w-4 h-4 mr-1" />New Sale</Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/credit-ledger')}><Wallet className="w-4 h-4 mr-1" />Receive Credit</Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/credit-ledger')}>View Ledger</Button>
            <Button size="sm" variant="outline" onClick={callCustomer}><Phone className="w-4 h-4 mr-1" />Call</Button>
            <Button size="sm" variant="outline" onClick={whatsappCustomer}><MessageCircle className="w-4 h-4 mr-1" />WhatsApp</Button>
            <Button size="sm" variant="outline" onClick={emailCustomer}><Mail className="w-4 h-4 mr-1" />Email</Button>
            <Button size="sm" variant="outline" onClick={() => printReport(buildPayload())}><Printer className="w-4 h-4 mr-1" />Statement</Button>
            <Button size="sm" variant="outline" onClick={() => exportPDF(buildPayload())}><FileDown className="w-4 h-4 mr-1" />Export</Button>
            <Button size="sm" variant={customerType==='VIP'?'default':'outline'} onClick={toggleVip}><Star className="w-4 h-4 mr-1" />{customerType==='VIP'?'VIP ✓':'Mark VIP'}</Button>
            <Button size="sm" variant={status==='Blocked'?'destructive':'outline'} onClick={toggleBlock}><Ban className="w-4 h-4 mr-1" />{status==='Blocked'?'Unblock':'Block'}</Button>
          </div>
        </div>
      </div>

      <div className="w-full p-3 sm:p-4 space-y-4 max-w-none xl:max-w-[1600px] mx-auto pb-28">
        {/* Section 1: Customer Information */}
        <Card className="p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold flex items-center gap-2"><UserIcon className="w-4 h-4" /> Customer Information</h2>
            <Button size="sm" variant="ghost" onClick={() => setShowEditDialog(true)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 text-sm">
            <Info label="Customer ID" value={customer.id.slice(0,8)} />
            <Info label="Mobile" value={customer.phone} icon={<Phone className="w-3 h-3" />} />
            <Info label="Alternate Mobile" value={extras.altPhone || '—'} icon={<Phone className="w-3 h-3" />} />
            <Info label="Email" value={customer.email || '—'} icon={<Mail className="w-3 h-3" />} />
            <Info label="Address" value={customer.address || '—'} icon={<MapPin className="w-3 h-3" />} />
            <Info label="City" value={extras.city || '—'} />
            <Info label="State" value={extras.state || '—'} />
            <Info label="Country" value={extras.country || '—'} />
            <Info label="Pincode" value={extras.pincode || '—'} />
            <Info label="GST Number" value={gstNumber || '—'} />
            <Info label="PAN" value={extras.pan || '—'} />
            <Info label="Company" value={extras.company || '—'} />
            <Info label="Customer Since" value={new Date(customer.createdAt).toLocaleDateString()} icon={<Calendar className="w-3 h-3" />} />
            <Info label="Last Visit" value={lastVisit ? lastVisit.toLocaleDateString() : '—'} icon={<Clock className="w-3 h-3" />} />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Customer Type</p>
              <Select value={customerType} onValueChange={saveType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{['Walk-in','Regular','VIP','Corporate'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select value={status} onValueChange={(v) => persistExtras({ ...extras, status: v as any })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{['Active','Inactive','Blocked'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {extras.notes && <div className="mt-3 p-2 rounded border bg-muted/30 text-sm"><span className="text-xs text-muted-foreground">Notes:</span> {extras.notes}</div>}
        </Card>

        {/* Section 2: Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <KpiCard label="Total Orders" value={completed.length} tone="primary" />
          <KpiCard label="Total Bills" value={orders.length} />
          <KpiCard label="Total Spend" value={formatCurrency(totalSales)} tone="success" />
          <KpiCard label="Avg Bill" value={formatCurrency(avgBill)} />
          <KpiCard label="Avg Items/Bill" value={avgItemsPerBill.toFixed(1)} />
          <KpiCard label="Total Qty" value={totalQty} />
          <KpiCard label="Outstanding Credit" value={formatCurrency(credit.outstanding)} tone={credit.outstanding>0?'destructive':'muted'} />
          <KpiCard label="Credit Limit" value={formatCurrency(creditLimit)} />
          <KpiCard label="Available Credit" value={formatCurrency(availableCredit)} tone="success" />
          <KpiCard label="Loyalty Points" value={loyaltyPoints} tone="primary" />
          <KpiCard label="Last Purchase" value={lastVisit ? lastVisit.toLocaleDateString() : '—'} />
          <KpiCard label="Total Discount" value={formatCurrency(totalDiscount)} tone="warning" />
        </div>

        {/* AI Insights */}
        {insights.length > 0 && (
          <Card className="p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI Insights</h2>
            <div className="space-y-2">
              {insights.map((ins,i) => {
                const Icon = ins.icon;
                const toneCls = ins.tone === 'success' ? 'bg-success/10 text-success border-success/30'
                  : ins.tone === 'warning' ? 'bg-warning/10 text-warning border-warning/30'
                  : ins.tone === 'destructive' ? 'bg-destructive/10 text-destructive border-destructive/30'
                  : 'bg-primary/10 text-primary border-primary/30';
                return <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${toneCls}`}><Icon className="w-4 h-4 mt-0.5 shrink-0" /><span>{ins.text}</span></div>;
              })}
            </div>
          </Card>
        )}

        <Tabs defaultValue="orders" className="w-full">
          <div className="w-full overflow-x-auto pb-1">
          <TabsList className="inline-flex min-w-max justify-start h-auto">
            <TabsTrigger value="orders">Order History</TabsTrigger>
            <TabsTrigger value="analytics">Purchase Analytics</TabsTrigger>
            <TabsTrigger value="payments">Payment Analytics</TabsTrigger>
            <TabsTrigger value="credit">Credit Ledger</TabsTrigger>
            <TabsTrigger value="returns">Returns & Refunds</TabsTrigger>
            <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>
          </div>

          {/* ORDER HISTORY */}
          <TabsContent value="orders" className="mt-4">
            <Card className="p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                <div className="relative flex-1 min-w-[180px]"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search invoice / order #..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" /></div>
                <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="h-9 w-auto" />
                <Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="h-9 w-auto" />
                <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}><SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="all">All Types</SelectItem><SelectItem value="dine-in">Dine-in</SelectItem><SelectItem value="takeaway">Takeaway</SelectItem><SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent></Select>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="all">All Payments</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="credit">Credit</SelectItem><SelectItem value="due">Due</SelectItem>
                </SelectContent></Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="all">All Status</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent></Select>
                <Button size="sm" variant="outline" onClick={() => exportCSV(buildPayload())}><FileText className="w-4 h-4 mr-1" />CSV</Button>
                <Button size="sm" variant="outline" onClick={() => exportExcel(buildPayload())}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF(buildPayload())}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
                <Button size="sm" variant="outline" onClick={() => printReport(buildPayload())}><Printer className="w-4 h-4 mr-1" />Print</Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted text-xs uppercase">
                    <tr>
                      <th className="p-2 text-left">Invoice</th>
                      <th className="p-2 text-left">Order #</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Time</th>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-left">Payment</th>
                      <th className="p-2 text-right">Bill</th>
                      <th className="p-2 text-right">Disc</th>
                      <th className="p-2 text-right">Tax</th>
                      <th className="p-2 text-right">Net</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Cashier</th>
                      {canSeeMultiStore && <th className="p-2 text-left">Outlet</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (<tr><td colSpan={canSeeMultiStore?13:12} className="p-6 text-center text-muted-foreground">No orders</td></tr>) :
                    filteredOrders.map(o => {
                      const d = new Date(o.createdAt);
                      const gross = (o.total||0) + (o.discount||0) - (o.tax||0);
                      return (
                        <tr key={o.id} className="border-t hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/orders?bill=${o.billNumber || o.id}`)}>
                          <td className="p-2 font-mono text-xs">{o.billNumber || o.id.slice(0,8)}</td>
                          <td className="p-2 font-mono text-xs">{o.id.slice(0,8)}</td>
                          <td className="p-2 whitespace-nowrap">{d.toLocaleDateString()}</td>
                          <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                          <td className="p-2 capitalize">{o.orderType}</td>
                          <td className="p-2 capitalize">{o.paymentMethod || '—'}</td>
                          <td className="p-2 text-right">{formatCurrency(gross)}</td>
                          <td className="p-2 text-right">{formatCurrency(o.discount||0)}</td>
                          <td className="p-2 text-right">{formatCurrency(o.tax||0)}</td>
                          <td className="p-2 text-right font-semibold">{formatCurrency(o.total)}</td>
                          <td className="p-2"><Badge variant={o.status==='cancelled'?'destructive':o.status==='completed'?'default':'secondary'}>{o.status}</Badge></td>
                          <td className="p-2 text-xs">{(o as any).cashierName || (o as any).createdBy || '—'}</td>
                          {canSeeMultiStore && <td className="p-2 text-xs">{(o.storeId||'—').slice(0,8)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* PURCHASE ANALYTICS */}
          <TabsContent value="analytics" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Favorite Product" value={analytics.favoriteProduct} tone="primary" />
              <KpiCard label="Favorite Category" value={analytics.favoriteCategory} tone="primary" />
              <KpiCard label="Purchase Frequency" value={`${analytics.purchaseFrequency.toFixed(1)}/mo`} />
              <KpiCard label="Visit Gap (avg)" value={`${analytics.avgGap.toFixed(1)} d`} />
              <KpiCard label="Highest Bill" value={formatCurrency(highestBill)} tone="success" />
              <KpiCard label="Lowest Bill" value={formatCurrency(lowestBill || 0)} />
              <KpiCard label="Peak Day" value={analytics.peakDay} />
              <KpiCard label="Peak Time" value={analytics.peakHour} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Top Products</h3>
                <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-muted text-xs uppercase"><tr><th className="p-2 text-left">Product</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Revenue</th></tr></thead>
                  <tbody>{analytics.topProducts.map(([n,d]) => <tr key={n} className="border-t"><td className="p-2">{n}</td><td className="p-2 text-right">{d.qty}</td><td className="p-2 text-right">{formatCurrency(d.revenue)}</td></tr>)}</tbody>
                </table>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Top Categories</h3>
                <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[300px] text-sm">
                  <thead className="bg-muted text-xs uppercase"><tr><th className="p-2 text-left">Category</th><th className="p-2 text-right">Revenue</th></tr></thead>
                  <tbody>{analytics.topCategories.map(([n,v]) => <tr key={n} className="border-t"><td className="p-2">{n}</td><td className="p-2 text-right">{formatCurrency(v)}</td></tr>)}</tbody>
                </table>
                </div>
              </Card>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Monthly Spending</h3>
                <div className="h-56"><ResponsiveContainer><AreaChart data={analytics.monthSeries}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v:any)=>formatCurrency(v)} /><Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" /></AreaChart></ResponsiveContainer></div>
              </Card>
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Yearly Spending</h3>
                <div className="h-56"><ResponsiveContainer><BarChart data={analytics.yearSeries}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip formatter={(v:any)=>formatCurrency(v)} /><Bar dataKey="revenue" fill="hsl(var(--success))" /></BarChart></ResponsiveContainer></div>
              </Card>
            </div>
          </TabsContent>

          {/* PAYMENT ANALYTICS */}
          <TabsContent value="payments" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Preferred Method" value={analytics.preferredPayment} tone="primary" />
              {['cash','upi','card','credit','wallet'].map(m => (
                <KpiCard key={m} label={m.toUpperCase()} value={formatCurrency(analytics.paymentMap.get(m) || 0)} />
              ))}
            </div>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Payment Distribution</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {paymentChart.length === 0 ? <p className="text-sm text-muted-foreground">No payments</p> :
                  paymentChart.map((p,i) => (
                    <div key={p.name} className="flex justify-between items-center p-2 rounded border">
                      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{background: COLORS[i%COLORS.length]}} /><span className="capitalize">{p.name}</span></div>
                      <span className="font-semibold">{formatCurrency(p.value)}</span>
                    </div>
                  ))}
                </div>
                <div className="h-64">
                  {paymentChart.length > 0 && (
                    <ResponsiveContainer><PieChart><Pie data={paymentChart} dataKey="value" nameKey="name" outerRadius={80} label>
                      {paymentChart.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie><Tooltip formatter={(v:any) => formatCurrency(v)} /></PieChart></ResponsiveContainer>
                  )}
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Payment Trend (by month)</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={analytics.paymentTrendSeries}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis />
                    <Tooltip formatter={(v:any)=>formatCurrency(v)} /><Legend />
                    {analytics.paymentMethods.map((m,i) => <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i%COLORS.length]} strokeWidth={2} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          {/* CREDIT LEDGER */}
          <TabsContent value="credit" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <KpiCard label="Outstanding" value={formatCurrency(credit.outstanding)} tone={credit.outstanding>0?'destructive':'success'} />
              <KpiCard label="Credit Limit" value={formatCurrency(creditLimit)} />
              <KpiCard label="Available" value={formatCurrency(availableCredit)} tone="success" />
              <KpiCard label="Total Collected" value={formatCurrency(credit.totalPaid)} tone="success" />
            </div>
            <Card className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Credit History</h3>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => navigate('/credit-ledger')}>Receive Payment</Button>
                  <Button size="sm" variant="outline" onClick={() => printReport(buildPayload())}><Printer className="w-4 h-4 mr-1" />Print</Button>
                  <Button size="sm" variant="outline" onClick={() => exportExcel(buildPayload())}><FileSpreadsheet className="w-4 h-4 mr-1" />Export</Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-muted text-xs uppercase"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Bill</th><th className="p-2 text-right">Due</th><th className="p-2 text-right">Paid</th><th className="p-2 text-right">Balance</th><th className="p-2 text-left">Status</th></tr></thead>
                <tbody>
                  {credit.entries.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No credit history</td></tr> :
                  credit.entries.map(e => {
                    const bal = e.due_amount - e.paid_amount;
                    const dueDate = (e as any).due_date;
                    const overdue = bal > 0 && dueDate && new Date(dueDate).getTime() < Date.now();
                    return (
                      <tr key={e.id} className="border-t">
                        <td className="p-2">{new Date(e.created_at).toLocaleDateString()}</td>
                        <td className="p-2 font-mono text-xs">{e.bill_number || '—'}</td>
                        <td className="p-2 text-right">{formatCurrency(e.due_amount)}</td>
                        <td className="p-2 text-right">{formatCurrency(e.paid_amount)}</td>
                        <td className="p-2 text-right font-semibold">{formatCurrency(bal)}</td>
                        <td className="p-2"><Badge variant={bal<=0?'default':overdue?'destructive':'secondary'}>{bal<=0?'Paid':overdue?'Overdue':'Pending'}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </Card>
            {credit.payments.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Payment Collection History</h3>
                <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted text-xs uppercase"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Method</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Notes</th></tr></thead>
                  <tbody>{credit.payments.map(p => <tr key={p.id} className="border-t"><td className="p-2">{new Date(p.created_at).toLocaleDateString()}</td><td className="p-2 capitalize">{p.payment_method}</td><td className="p-2 text-right">{formatCurrency(p.amount)}</td><td className="p-2 text-xs">{p.notes || '—'}</td></tr>)}</tbody>
                </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* RETURNS */}
          <TabsContent value="returns" className="mt-4">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <KpiCard label="Cancelled Orders" value={analytics.returnedOrders} tone="warning" />
              <KpiCard label="Refund Amount" value={formatCurrency(analytics.refundAmount)} tone="destructive" />
            </div>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Cancelled / Refunded</h3>
              <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted text-xs uppercase"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Invoice</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Reason</th></tr></thead>
                <tbody>
                  {orders.filter(o => o.status==='cancelled').length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No returns</td></tr> :
                  orders.filter(o => o.status==='cancelled').map(o => <tr key={o.id} className="border-t"><td className="p-2">{new Date(o.createdAt).toLocaleDateString()}</td><td className="p-2 font-mono text-xs">{o.billNumber || '—'}</td><td className="p-2 text-right">{formatCurrency(o.total)}</td><td className="p-2 text-xs">{(o as any).cancelReason || '—'}</td></tr>)}
                </tbody>
              </table>
              </div>
            </Card>
          </TabsContent>

          {/* LOYALTY */}
          <TabsContent value="loyalty" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Current Points" value={loyaltyPoints} tone="primary" icon={<Gift className="w-4 h-4" />} />
              <KpiCard label="Earned Points" value={loyaltyPoints} tone="success" />
              <KpiCard label="Redeemed Points" value={0} />
              <KpiCard label="Membership Level" value={tier} tone="primary" />
            </div>
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Award className="w-4 h-4" /> Membership Progress</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                {(['Silver','Gold','Diamond'] as const).map(t => {
                  const active = tier === t;
                  return (
                    <div key={t} className={`p-4 rounded-lg border-2 ${active ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                      <Crown className={`w-6 h-6 mx-auto mb-1 ${active?'text-primary':'text-muted-foreground'}`} />
                      <p className={`font-semibold ${active?'text-primary':''}`}>{t}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t==='Silver'?'5+ orders':t==='Gold'?'20+ orders or ₹25k':'50+ orders or ₹1L'}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">1 point earned per ₹100 spent. Tier auto-upgrades based on lifetime activity.</p>
            </Card>
          </TabsContent>

          {/* TIMELINE */}
          <TabsContent value="timeline" className="mt-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Activity Timeline</h3>
              <div className="space-y-3">
                {timeline.map(ev => (
                  <div key={ev.id} className="flex gap-3 pb-3 border-b last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${ev.tone==='success'?'bg-success':ev.tone==='warning'?'bg-warning':ev.tone==='destructive'?'bg-destructive':ev.tone==='primary'?'bg-primary':'bg-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2"><p className="font-medium text-sm">{ev.label}</p><p className="text-xs text-muted-foreground whitespace-nowrap">{new Date(ev.date).toLocaleString()}</p></div>
                      {ev.meta && <p className="text-xs text-muted-foreground">{ev.meta}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* NOTES */}
          <TabsContent value="notes" className="mt-4">
            <Card className="p-4">
              <div className="flex justify-between items-center mb-3"><h3 className="font-semibold">Notes</h3><Button size="sm" onClick={() => setShowNoteDialog(true)}><Plus className="w-4 h-4 mr-1" />Add Note</Button></div>
              <div className="space-y-2">
                {notes.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No notes yet</p> :
                notes.map(n => (
                  <div key={n.id} className="flex justify-between items-start p-3 rounded border">
                    <div className="flex-1">
                      {n.tag && <Badge variant="outline" className="mb-1">{n.tag}</Badge>}
                      <p className="text-sm">{n.text}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                    <button onClick={() => removeNote(n.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* DOCUMENTS */}
          <TabsContent value="documents" className="mt-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Documents</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {['GST Certificate','Business License','PAN','Other'].map(t => (
                  <label key={t} className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:bg-muted text-sm">
                    <FileText className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    {t}
                    <input type="file" className="hidden" accept="image/*,application/pdf" onChange={e => onUploadDoc(e, t)} />
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                {docs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No documents</p> :
                docs.map(d => (
                  <div key={d.id} className="flex justify-between items-center p-2 rounded border">
                    <a href={d.dataUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm flex-1 min-w-0">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate">{d.name}</span>
                      <Badge variant="outline" className="text-xs">{d.type}</Badge>
                    </a>
                    <button onClick={() => removeDoc(d.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* CHARTS */}
          <TabsContent value="charts" className="mt-4 space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Monthly Spending Trend</h3>
              <div className="h-64">
                <ResponsiveContainer><LineChart data={analytics.monthSeries}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v:any) => formatCurrency(v)} /><Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} /></LineChart></ResponsiveContainer>
              </div>
            </Card>
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Day-of-Week Spending</h3>
                <div className="h-64">
                  <ResponsiveContainer><BarChart data={analytics.daySeries}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip formatter={(v:any) => formatCurrency(v)} /><Bar dataKey="revenue" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Category Distribution</h3>
                <div className="h-64">
                  <ResponsiveContainer><PieChart><Pie data={analytics.topCategories.map(([n,v]) => ({name:n, value:v}))} dataKey="value" nameKey="name" outerRadius={80} label>
                    {analytics.topCategories.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie><Tooltip formatter={(v:any) => formatCurrency(v)} /><Legend /></PieChart></ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Yearly Growth</h3>
                <div className="h-64">
                  <ResponsiveContainer><BarChart data={analytics.yearSeries}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip formatter={(v:any) => formatCurrency(v)} /><Bar dataKey="revenue" fill="hsl(var(--success))" /></BarChart></ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Product Distribution</h3>
                <div className="h-64">
                  <ResponsiveContainer><PieChart><Pie data={analytics.topProducts.map(([n,d]) => ({name:n, value:d.revenue}))} dataKey="value" nameKey="name" outerRadius={80} label>
                    {analytics.topProducts.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie><Tooltip formatter={(v:any) => formatCurrency(v)} /><Legend /></PieChart></ResponsiveContainer>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Tag (e.g. VIP, Birthday, Preferred Table)" value={noteTag} onChange={e => setNoteTag(e.target.value)} />
            <Textarea placeholder="Note details..." value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} />
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setShowNoteDialog(false)}>Cancel</Button><Button className="flex-1" onClick={addNote}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <EditCustomerDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        customer={customer}
        extras={extras}
        gstNumber={gstNumber}
        onSave={(patch, ex, gst) => { saveGst(gst); saveCustomerEdit(patch, ex); }}
      />
    </div>
  );
};

const Info: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">{icon}{label}</p>
    <p className="text-sm font-medium break-words" title={value}>{value}</p>
  </div>
);

const EditCustomerDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer;
  extras: CustomerExtras;
  gstNumber: string;
  onSave: (patch: Partial<Customer>, extras: CustomerExtras, gst: string) => void;
}> = ({ open, onOpenChange, customer, extras, gstNumber, onSave }) => {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email || '');
  const [address, setAddress] = useState(customer.address || '');
  const [gst, setGst] = useState(gstNumber);
  const [ex, setEx] = useState<CustomerExtras>(extras);
  useEffect(() => {
    setName(customer.name); setPhone(customer.phone); setEmail(customer.email || ''); setAddress(customer.address || '');
    setGst(gstNumber); setEx(extras);
  }, [customer, extras, gstNumber, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name *"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Mobile *"><Input value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="Alternate Mobile"><Input value={ex.altPhone || ''} onChange={e => setEx({...ex, altPhone: e.target.value})} /></Field>
          <Field label="Email"><Input value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Address" wide><Input value={address} onChange={e => setAddress(e.target.value)} /></Field>
          <Field label="City"><Input value={ex.city || ''} onChange={e => setEx({...ex, city: e.target.value})} /></Field>
          <Field label="State"><Input value={ex.state || ''} onChange={e => setEx({...ex, state: e.target.value})} /></Field>
          <Field label="Country"><Input value={ex.country || ''} onChange={e => setEx({...ex, country: e.target.value})} /></Field>
          <Field label="Pincode"><Input value={ex.pincode || ''} onChange={e => setEx({...ex, pincode: e.target.value})} /></Field>
          <Field label="GST Number"><Input value={gst} onChange={e => setGst(e.target.value)} /></Field>
          <Field label="PAN"><Input value={ex.pan || ''} onChange={e => setEx({...ex, pan: e.target.value})} /></Field>
          <Field label="Company Name"><Input value={ex.company || ''} onChange={e => setEx({...ex, company: e.target.value})} /></Field>
          <Field label="Credit Limit"><Input type="number" value={ex.creditLimit ?? ''} onChange={e => setEx({...ex, creditLimit: Number(e.target.value) || 0})} /></Field>
          <Field label="Customer Notes" wide><Textarea value={ex.notes || ''} onChange={e => setEx({...ex, notes: e.target.value})} rows={2} /></Field>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1" onClick={() => {
            if (!name.trim() || !phone.trim()) { toast.error('Name & mobile required'); return; }
            onSave({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, address: address.trim() || undefined }, ex, gst.trim());
          }}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Field: React.FC<{ label: string; wide?: boolean; children: React.ReactNode }> = ({ label, wide, children }) => (
  <div className={wide ? 'sm:col-span-2' : ''}>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    {children}
  </div>
);

export default CustomerProfilePage;
