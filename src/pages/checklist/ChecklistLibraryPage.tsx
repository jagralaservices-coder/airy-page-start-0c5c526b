import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Copy, ClipboardList, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useChecklists, useTemplates, useInvalidateChecklists, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const table = (n: string) => supabase.from(n as any);

const ChecklistLibraryPage: React.FC = () => {
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  const { data: lists = [], isLoading } = useChecklists();
  const { data: templates = [] } = useTemplates();
  const invalidate = useInvalidateChecklists();

  const [search, setSearch] = useState('');
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [selectedTpl, setSelectedTpl] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => lists.filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase())), [lists, search]);

  const create = async () => {
    if (!merchantId || !user?.id || !name.trim()) return;
    const { data, error } = await table('checklists').insert({
      merchant_id: merchantId, name: name.trim(), description, department,
      frequency, is_active: true, created_by: user.id,
    }).select('id').maybeSingle();
    if (error || !data) { toast.error(error?.message ?? 'Failed'); return; }
    const items = Array.from(selectedTpl).map((tid, i) => {
      const tpl: any = templates.find((t: any) => t.id === tid);
      return {
        checklist_id: data.id,
        title: tpl.title,
        description: tpl.description,
        answer_type: tpl.suggested_answer_type,
        photo_required: tpl.photo_required,
        ai_verify: tpl.ai_verify,
        required: true,
        order_index: i,
      };
    });
    if (items.length) await table('checklist_items').insert(items);
    await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'checklist', entity_id: data.id, action: 'created', meta: { name } });
    toast.success('Checklist created');
    setOpenNew(false); setName(''); setDescription(''); setDepartment(''); setSelectedTpl(new Set());
    invalidate();
  };

  const del = async (id: string) => {
    if (!confirm('Delete this checklist?')) return;
    const { error } = await table('checklists').delete().eq('id', id);
    if (error) return toast.error(error.message);
    if (merchantId && user?.id) await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'checklist', entity_id: id, action: 'deleted' });
    toast.success('Deleted'); invalidate();
  };

  const duplicate = async (c: any) => {
    if (!merchantId || !user?.id) return;
    const { data: dup } = await table('checklists').insert({
      merchant_id: merchantId, name: `${c.name} (copy)`, description: c.description, department: c.department,
      frequency: c.frequency, is_active: true, created_by: user.id,
    }).select('id').maybeSingle();
    if (!dup) return;
    const { data: items } = await table('checklist_items').select('*').eq('checklist_id', c.id);
    if (items?.length) {
      await table('checklist_items').insert(items.map((it: any) => ({
        ...it, id: undefined, checklist_id: dup.id, created_at: undefined, updated_at: undefined,
      })));
    }
    toast.success('Duplicated'); invalidate();
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><ClipboardList className="h-7 w-7" /> Staff Checklists</h1>
          <p className="text-sm text-muted-foreground">Create AI-verified checklists for grooming, cleaning and operations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
          <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New checklist</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/checklists/uniform"><Button variant="outline"><Sparkles className="h-4 w-4 mr-1" /> Uniform reference</Button></Link>
        <Link to="/checklists/review"><Button variant="outline">Review submissions</Button></Link>
        <Link to="/checklists/reports"><Button variant="outline">Reports</Button></Link>
        <Link to="/checklists/audit"><Button variant="outline">Audit log</Button></Link>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card/60 backdrop-blur rounded-2xl">
          <CardContent className="p-10 text-center space-y-3">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No checklists yet. Create your first from templates.</p>
            <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> New checklist</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c: any) => (
            <Card key={c.id} className="bg-card/60 backdrop-blur rounded-2xl hover:shadow-lg transition">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{c.name}</CardTitle>
                  <Badge variant="outline">{c.frequency}</Badge>
                </div>
                {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{c.department || '—'}</div>
                <div className="flex items-center gap-1">
                  <Link to={`/checklists/${c.id}/edit`}><Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button></Link>
                  <Button size="sm" variant="ghost" onClick={() => duplicate(c)}><Copy className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New checklist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Checklist name" value={name} onChange={e => setName(e.target.value)} />
            <Input placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Department (kitchen, floor…)" value={department} onChange={e => setDepartment(e.target.value)} />
              <select className="border border-border bg-background rounded-md px-3 py-2 text-sm" value={frequency} onChange={e => setFrequency(e.target.value)}>
                {['daily','weekly','monthly','before_shift','after_shift','custom','once'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Pick default items to include</div>
              <div className="max-h-64 overflow-auto grid grid-cols-2 gap-1 border border-border rounded-lg p-2">
                {templates.map((t: any) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-accent cursor-pointer">
                    <input type="checkbox" checked={selectedTpl.has(t.id)} onChange={e => {
                      const n = new Set(selectedTpl); if (e.target.checked) n.add(t.id); else n.delete(t.id); setSelectedTpl(n);
                    }} />
                    <span>{t.title}</span>
                    {t.ai_verify && <Sparkles className="h-3 w-3 text-primary" />}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={!name.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChecklistLibraryPage;
