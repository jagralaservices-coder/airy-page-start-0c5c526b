import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Trash2, Power, Tag, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { listBrands, createBrand, updateBrand, deleteBrand, toggleBrandStatus, Brand } from '@/lib/brands';
import { useReportScope } from '@/lib/reports/scope';
import { supabase } from '@/integrations/supabase/client';

interface StoreOpt { id: string; name: string }

const BrandsPage: React.FC = () => {
  const navigate = useNavigate();
  const scope = useReportScope();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Partial<Brand> | null>(null);
  const [open, setOpen] = useState(false);

  const loadStores = async () => {
    if (scope.isOwner) {
      const { data } = await (supabase as any).from('stores').select('id, name').eq('is_active', true).order('name');
      setStores((data ?? []) as StoreOpt[]);
    } else if (scope.storeId) {
      setStores([{ id: scope.storeId, name: scope.storeName }]);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const storeIds = scope.isOwner
        ? (stores.length ? stores.map(s => s.id) : [])
        : scope.storeId ? [scope.storeId] : [];
      if (storeIds.length === 0) { setBrands([]); return; }
      const rows = await listBrands(storeIds);
      setBrands(rows);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load brands');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadStores(); }, [scope.isOwner, scope.storeId]);
  useEffect(() => { if (stores.length || !scope.isOwner) load(); }, [stores.length, scope.storeId]);

  const filtered = useMemo(() => {
    return brands.filter(b => {
      if (storeFilter !== 'all' && b.store_id !== storeFilter) return false;
      if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [brands, search, storeFilter]);

  const openCreate = () => {
    setEditing({
      name: '',
      brand_type: 'external',
      description: '',
      status: 'active',
      store_id: scope.isOwner ? (stores[0]?.id ?? '') : (scope.storeId ?? ''),
    });
    setOpen(true);
  };
  const openEdit = (b: Brand) => { setEditing({ ...b }); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error('Brand name is required'); return; }
    if (!editing.store_id) { toast.error('Select a store'); return; }
    try {
      if (editing.id) {
        await updateBrand(editing.id, editing);
        toast.success('Brand updated');
      } else {
        await createBrand({
          store_id: editing.store_id!,
          name: editing.name!,
          brand_type: editing.brand_type ?? 'external',
          description: editing.description ?? null,
          status: editing.status ?? 'active',
        });
        toast.success('Brand created');
      }
      setOpen(false); setEditing(null); load();
    } catch (e: any) { toast.error(e.message ?? 'Save failed'); }
  };

  const remove = async (b: Brand) => {
    if (!confirm(`Delete brand "${b.name}"? Products keep their data but lose the link.`)) return;
    try { await deleteBrand(b.id); toast.success('Deleted'); load(); }
    catch (e: any) { toast.error(e.message ?? 'Delete failed'); }
  };

  const toggle = async (b: Brand) => {
    try {
      await toggleBrandStatus(b.id, b.status === 'active' ? 'inactive' : 'active');
      load();
    } catch (e: any) { toast.error(e.message ?? 'Toggle failed'); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="p-2 bg-primary/10 rounded-lg"><Tag className="h-5 w-5 text-primary" /></div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">Brand Master</h1>
              <p className="text-xs text-muted-foreground">Optional brands for products • {scope.storeName}</p>
            </div>
          </div>
          <Button onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" />New Brand</Button>
        </div>
        <div className="flex gap-2 px-4 pb-3 items-center flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brands…" className="h-9 pl-7 w-56 text-sm" />
          </div>
          {scope.isOwner && stores.length > 1 && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="p-4">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No brands yet. <button onClick={openCreate} className="text-primary underline">Create the first one</button>.
                  </TableCell></TableRow>
                ) : filtered.map(b => {
                  const store = stores.find(s => s.id === b.store_id);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>
                        <Badge variant={b.brand_type === 'internal' ? 'secondary' : 'default'} className="text-[10px] uppercase">
                          {b.brand_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{store?.name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{b.description || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={b.status === 'active' ? 'default' : 'outline'} className="text-[10px]">
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => toggle(b)} title="Toggle status"><Power className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(b)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground mt-3">
          Brand is optional on products. Products without a brand are reported under the store's default internal brand
          ({stores[0]?.name ?? 'Store name'} by default).
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit Brand' : 'New Brand'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Brand Name *</label>
              <Input value={editing?.name ?? ''} onChange={(e) => setEditing(s => ({ ...s!, name: e.target.value }))} placeholder="e.g. Coca-Cola, Amul, Samsung" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Brand Type *</label>
              <Select value={editing?.brand_type ?? 'external'} onValueChange={(v) => setEditing(s => ({ ...s!, brand_type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">External (3rd-party brand)</SelectItem>
                  <SelectItem value="internal">Internal (House / Own brand)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope.isOwner && stores.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Store *</label>
                <Select value={editing?.store_id ?? ''} onValueChange={(v) => setEditing(s => ({ ...s!, store_id: v }))} disabled={!!editing?.id}>
                  <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea value={editing?.description ?? ''} onChange={(e) => setEditing(s => ({ ...s!, description: e.target.value }))} placeholder="Optional notes" rows={2} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={editing?.status ?? 'active'} onValueChange={(v) => setEditing(s => ({ ...s!, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing?.id ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BrandsPage;
