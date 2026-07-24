import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useAssignments, useChecklistItems, useInvalidateChecklists, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { toast } from 'sonner';

const table = (n: string) => supabase.from(n as any);
const ANSWER_TYPES = ['yes_no','text','number','photo','multi_photo','signature'] as const;

const ChecklistBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  const invalidate = useInvalidateChecklists();

  const [checklist, setChecklist] = useState<any>(null);
  const { data: items = [] } = useChecklistItems(id ?? null);
  const { data: assignments = [] } = useAssignments(id);

  const [localItems, setLocalItems] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  useEffect(() => { setLocalItems(items); }, [items]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await table('checklists').select('*').eq('id', id).maybeSingle();
      setChecklist(data);
    })();
  }, [id]);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const { data: staffRows } = await table('user_roles').select('id,user_id,role').eq('customer_id', merchantId).in('role', ['staff','cashier','store_manager']);
      const uids = (staffRows ?? []).map((r: any) => r.user_id).filter(Boolean);
      if (uids.length) {
        const { data: profs } = await table('profiles').select('id,full_name,email').in('id', uids);
        setStaff((staffRows ?? []).map((r: any) => ({ ...r, profile: profs?.find((p: any) => p.id === r.user_id) })));
      }
      const { data: st } = await table('stores').select('id,name').eq('customer_id', merchantId);
      setStores(st ?? []);
    })();
  }, [merchantId]);

  const addItem = () => setLocalItems(prev => [...prev, {
    _new: true, checklist_id: id, title: '', answer_type: 'yes_no',
    required: true, photo_required: false, video_required: false,
    gps_required: false, time_required: false, ai_verify: false,
    order_index: prev.length,
  }]);

  const removeItem = async (i: number) => {
    const it = localItems[i];
    if (it.id) await table('checklist_items').delete().eq('id', it.id);
    setLocalItems(prev => prev.filter((_, idx) => idx !== i));
  };

  const move = (i: number, dir: -1 | 1) => {
    setLocalItems(prev => {
      const arr = [...prev]; const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr.map((x, idx) => ({ ...x, order_index: idx }));
    });
  };

  const saveAll = async () => {
    if (!id || !merchantId || !user?.id) return;
    if (checklist) {
      await table('checklists').update({
        name: checklist.name, description: checklist.description, department: checklist.department,
        frequency: checklist.frequency, is_active: checklist.is_active,
      }).eq('id', id);
    }
    for (let idx = 0; idx < localItems.length; idx++) {
      const it = { ...localItems[idx], order_index: idx };
      const { _new, ...rest } = it;
      if (_new || !it.id) {
        await table('checklist_items').insert({ ...rest, checklist_id: id, id: undefined });
      } else {
        await table('checklist_items').update(rest).eq('id', it.id);
      }
    }
    await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'checklist', entity_id: id, action: 'edited' });
    toast.success('Saved');
    invalidate();
  };

  const assignTo = async (kind: 'role' | 'user' | 'store', value: string) => {
    if (!id || !merchantId || !user?.id) return;
    const row: any = { checklist_id: id, is_active: true };
    if (kind === 'role') row.assigned_role = value;
    if (kind === 'user') row.assigned_user_id = value;
    if (kind === 'store') row.store_id = value;
    const { error } = await table('checklist_assignments').insert(row);
    if (error) return toast.error(error.message);
    await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'checklist', entity_id: id, action: 'assigned', meta: row });
    toast.success('Assigned');
    invalidate();
  };

  const removeAssignment = async (aid: string) => {
    await table('checklist_assignments').delete().eq('id', aid);
    invalidate();
  };

  if (!checklist) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav('/checklists')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="flex-1" />
        <Button onClick={saveAll}><Save className="h-4 w-4 mr-1" /> Save</Button>
      </div>

      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Input value={checklist.name ?? ''} onChange={e => setChecklist({ ...checklist, name: e.target.value })} placeholder="Name" />
          <Input value={checklist.department ?? ''} onChange={e => setChecklist({ ...checklist, department: e.target.value })} placeholder="Department" />
          <Input className="md:col-span-2" value={checklist.description ?? ''} onChange={e => setChecklist({ ...checklist, description: e.target.value })} placeholder="Description" />
          <select className="border border-border bg-background rounded-md px-3 py-2 text-sm" value={checklist.frequency} onChange={e => setChecklist({ ...checklist, frequency: e.target.value })}>
            {['daily','weekly','monthly','before_shift','after_shift','custom','once'].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={checklist.is_active} onChange={e => setChecklist({ ...checklist, is_active: e.target.checked })} />
            Active
          </label>
        </CardContent>
      </Card>

      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items</CardTitle>
          <Button size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {localItems.map((it, i) => (
            <div key={it.id ?? `n-${i}`} className="rounded-xl border border-border p-3 space-y-2 bg-background/50">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground">▲</button>
                  <button onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground">▼</button>
                </div>
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <Input className="flex-1" value={it.title} onChange={e => { const arr = [...localItems]; arr[i] = { ...it, title: e.target.value }; setLocalItems(arr); }} placeholder="Item title (e.g. Uniform check)" />
                <select className="border border-border bg-background rounded-md px-2 py-1 text-sm" value={it.answer_type} onChange={e => { const arr = [...localItems]; arr[i] = { ...it, answer_type: e.target.value }; setLocalItems(arr); }}>
                  {ANSWER_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <Button variant="ghost" size="sm" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
              <Input value={it.description ?? ''} onChange={e => { const arr = [...localItems]; arr[i] = { ...it, description: e.target.value }; setLocalItems(arr); }} placeholder="Instructions (optional)" />
              <div className="flex flex-wrap gap-3 text-xs">
                {(['required','photo_required','video_required','gps_required','time_required','ai_verify'] as const).map(k => (
                  <label key={k} className="flex items-center gap-1">
                    <input type="checkbox" checked={!!it[k]} onChange={e => { const arr = [...localItems]; arr[i] = { ...it, [k]: e.target.checked }; setLocalItems(arr); }} />
                    <span className="capitalize">{k.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {localItems.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No items yet — click "Add item".</div>}
        </CardContent>
      </Card>

      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Assignments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-2">
            <div>
              <div className="text-xs mb-1 text-muted-foreground">By role</div>
              <div className="flex gap-1 flex-wrap">
                {['staff','cashier','store_manager'].map(r => (
                  <Button key={r} size="sm" variant="outline" onClick={() => assignTo('role', r)}>+ {r}</Button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1 text-muted-foreground">Specific staff</div>
              <select className="w-full border border-border bg-background rounded-md px-2 py-1 text-sm" onChange={e => { if (e.target.value) { assignTo('user', e.target.value); e.target.value = ''; } }}>
                <option value="">Pick staff…</option>
                {staff.map(s => <option key={s.id} value={s.user_id}>{s.profile?.full_name || s.profile?.email || s.user_id}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs mb-1 text-muted-foreground">Entire store</div>
              <select className="w-full border border-border bg-background rounded-md px-2 py-1 text-sm" onChange={e => { if (e.target.value) { assignTo('store', e.target.value); e.target.value = ''; } }}>
                <option value="">Pick store…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            {assignments.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  {a.assigned_role && <>Role: <b>{a.assigned_role}</b></>}
                  {a.assigned_user_id && <>Staff: <b>{staff.find(s => s.user_id === a.assigned_user_id)?.profile?.full_name || a.assigned_user_id}</b></>}
                  {a.store_id && !a.assigned_role && !a.assigned_user_id && <>Store: <b>{stores.find(s => s.id === a.store_id)?.name || a.store_id}</b></>}
                </span>
                <Button variant="ghost" size="sm" onClick={() => removeAssignment(a.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            ))}
            {assignments.length === 0 && <div className="text-sm text-muted-foreground">Not assigned to anyone yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChecklistBuilderPage;
