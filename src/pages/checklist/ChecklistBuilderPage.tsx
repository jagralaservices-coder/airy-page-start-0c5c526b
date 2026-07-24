import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Users, Upload, Image as ImageIcon, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useAssignments, useChecklistItems, useInvalidateChecklists, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { toast } from 'sonner';

const table = (n: string) => supabase.from(n as any);

type InputType = 'tick' | 'image' | 'tick_image' | 'text' | 'number';
const INPUT_OPTIONS: { value: InputType; label: string; hint: string }[] = [
  { value: 'tick', label: 'Tick Only', hint: 'e.g. PC ON, Gas OFF' },
  { value: 'image', label: 'Image Only', hint: 'e.g. Kitchen cleaning' },
  { value: 'tick_image', label: 'Tick + Image', hint: 'e.g. Uniform, Hand wash' },
  { value: 'text', label: 'Text', hint: 'Short written answer' },
  { value: 'number', label: 'Number', hint: 'Numeric reading' },
];

const SHIFTS = ['Opening', 'Mid Shift', 'Closing'] as const;
const SCHEDULES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];
const DEPARTMENTS = ['Kitchen', 'Service', 'Cash Counter', 'Housekeeping', 'Delivery', 'Store', 'Custom'];

interface ItemDraft {
  _new?: boolean;
  id?: string;
  checklist_id?: string;
  title: string;
  description?: string | null;
  input_type: InputType;
  required: boolean;
  photo_required?: boolean;
  video_required?: boolean;
  gps_required?: boolean;
  time_required?: boolean;
  ai_verify?: boolean;
  order_index: number;
  answer_type?: string;
}

interface RefImg { id: string; item_id: string; storage_path: string; url?: string }

const ChecklistBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  const invalidate = useInvalidateChecklists();

  const [checklist, setChecklist] = useState<any>(null);
  const [customDepartment, setCustomDepartment] = useState('');
  const [deptMode, setDeptMode] = useState<string>('');
  const { data: items = [] } = useChecklistItems(id ?? null);
  const { data: assignments = [] } = useAssignments(id);

  const [localItems, setLocalItems] = useState<ItemDraft[]>([]);
  const [refs, setRefs] = useState<RefImg[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalItems((items as any[]).map((it) => ({
      ...it,
      input_type: (it.input_type ?? 'tick') as InputType,
    })));
  }, [items]);

  const loadRefs = async (itemIds: string[]) => {
    if (!itemIds.length) { setRefs([]); return; }
    const { data } = await table('checklist_item_reference_images').select('*').in('item_id', itemIds);
    const rows = (data ?? []) as any[];
    const withUrls = await Promise.all(rows.map(async (r) => {
      const { data: signed } = await supabase.storage.from('uniform-reference').createSignedUrl(r.storage_path, 3600);
      return { ...r, url: signed?.signedUrl } as RefImg;
    }));
    setRefs(withUrls);
  };

  useEffect(() => {
    const ids = (items as any[]).map((it) => it.id).filter(Boolean);
    loadRefs(ids);
  }, [items]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await table('checklists').select('*').eq('id', id).maybeSingle();
      setChecklist(data);
      if (data?.department) {
        if (DEPARTMENTS.includes(data.department)) {
          setDeptMode(data.department);
        } else {
          setDeptMode('Custom');
          setCustomDepartment(data.department);
        }
      }
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
    _new: true, checklist_id: id, title: '', input_type: 'tick',
    required: true, order_index: prev.length,
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

  const patch = (i: number, p: Partial<ItemDraft>) =>
    setLocalItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...p } : it));

  const answerTypeFor = (t: InputType): string => {
    if (t === 'image' || t === 'tick_image') return 'photo';
    if (t === 'text') return 'text';
    if (t === 'number') return 'number';
    return 'yes_no';
  };

  const saveAll = async () => {
    if (!id || !merchantId || !user?.id) return;
    if (!checklist?.name?.trim()) { toast.error('Checklist name is required'); return; }
    setSaving(true);
    try {
      const dept = deptMode === 'Custom' ? customDepartment.trim() : deptMode;
      await table('checklists').update({
        name: checklist.name.trim(),
        description: checklist.description ?? '',
        department: dept ?? '',
        category: checklist.category ?? '',
        shift_time: checklist.shift_time ?? null,
        frequency: checklist.frequency ?? 'daily',
        is_active: !!checklist.is_active,
      }).eq('id', id);

      for (let idx = 0; idx < localItems.length; idx++) {
        const it = { ...localItems[idx], order_index: idx };
        const isImage = it.input_type === 'image' || it.input_type === 'tick_image';
        const payload: any = {
          title: it.title,
          description: it.description ?? null,
          input_type: it.input_type,
          answer_type: answerTypeFor(it.input_type),
          photo_required: !!(it.photo_required || isImage),
          video_required: !!it.video_required,
          gps_required: !!it.gps_required,
          time_required: !!it.time_required,
          ai_verify: !!it.ai_verify,
          required: it.required ?? true,
          order_index: idx,
        };
        if (it._new || !it.id) {
          const { data: ins } = await table('checklist_items').insert({ ...payload, checklist_id: id }).select('id').maybeSingle();
          if (ins?.id) setLocalItems(prev => prev.map((x, xi) => xi === idx ? { ...x, id: ins.id, _new: false } : x));
        } else {
          await table('checklist_items').update(payload).eq('id', it.id);
        }
      }
      await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'checklist', entity_id: id, action: 'edited' });
      toast.success('Saved');
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const uploadRef = async (item: ItemDraft, file: File) => {
    if (!merchantId || !user?.id) return;
    if (!item.id) { toast.error('Save the checklist first, then upload references.'); return; }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${merchantId}/items/${item.id}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from('uniform-reference').upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) { toast.error(upErr.message); return; }
    const { error: insErr } = await table('checklist_item_reference_images').insert({
      item_id: item.id, merchant_id: merchantId, storage_path: path, uploaded_by: user.id,
    });
    if (insErr) { toast.error(insErr.message); return; }
    toast.success('Reference image uploaded');
    await loadRefs(localItems.map(x => x.id!).filter(Boolean));
  };

  const removeRef = async (r: RefImg) => {
    if (!confirm('Remove this reference image?')) return;
    await supabase.storage.from('uniform-reference').remove([r.storage_path]);
    await table('checklist_item_reference_images').delete().eq('id', r.id);
    setRefs(prev => prev.filter(x => x.id !== r.id));
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
        <Button onClick={saveAll} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save'}</Button>
      </div>

      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader><CardTitle>Checklist Details</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Checklist Name *</label>
            <Input value={checklist.name ?? ''} onChange={e => setChecklist({ ...checklist, name: e.target.value })} placeholder="e.g. Morning Opening Checklist" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Shift</label>
            <select
              className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm"
              value={checklist.category ?? ''}
              onChange={e => setChecklist({ ...checklist, category: e.target.value, shift_time: e.target.value ? (checklist.shift_time ?? '') : null })}
            >
              <option value="">No shift</option>
              {SHIFTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {!!checklist.category && SHIFTS.includes(checklist.category) && (
              <div className="mt-2">
                <label className="text-xs text-muted-foreground">Shift Time</label>
                <Input
                  type="time"
                  value={checklist.shift_time ?? ''}
                  onChange={e => setChecklist({ ...checklist, shift_time: e.target.value })}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Department</label>
            <select
              className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm"
              value={deptMode}
              onChange={e => setDeptMode(e.target.value)}
            >
              <option value="">Select department…</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {deptMode === 'Custom' && (
              <Input className="mt-2" value={customDepartment} onChange={e => setCustomDepartment(e.target.value)} placeholder="Custom department name" />
            )}
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Description</label>
            <Input value={checklist.description ?? ''} onChange={e => setChecklist({ ...checklist, description: e.target.value })} placeholder="What is this checklist for?" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Schedule Type</label>
            <select className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm" value={checklist.frequency ?? 'daily'} onChange={e => setChecklist({ ...checklist, frequency: e.target.value })}>
              {SCHEDULES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm mt-6">
            <input type="checkbox" checked={!!checklist.is_active} onChange={e => setChecklist({ ...checklist, is_active: e.target.checked })} />
            Active
          </label>
        </CardContent>
      </Card>

      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Checklist Items</CardTitle>
          <Button size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {localItems.map((it, i) => {
            const isImage = it.input_type === 'image' || it.input_type === 'tick_image';
            const showRefs = isImage || !!it.ai_verify || !!it.photo_required;
            const itemRefs = refs.filter(r => r.item_id === it.id);
            return (
              <div key={it.id ?? `n-${i}`} className="rounded-xl border border-border p-3 space-y-3 bg-background/50">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground">▲</button>
                    <button onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground">▼</button>
                  </div>
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Input className="flex-1" value={it.title} onChange={e => patch(i, { title: e.target.value })} placeholder="Item name (e.g. Uniform)" />
                  <Button variant="ghost" size="sm" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
                <Input value={it.description ?? ''} onChange={e => patch(i, { description: e.target.value })} placeholder="Instructions (optional)" />

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Response Type</div>
                  <div className="flex flex-wrap gap-2">
                    {INPUT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => patch(i, { input_type: opt.value })}
                        className={`px-3 py-1.5 rounded-full text-sm border transition ${
                          it.input_type === opt.value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-border hover:bg-accent'
                        }`}
                        title={opt.hint}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Additional Options</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!it.required} onChange={e => patch(i, { required: e.target.checked })} /> Required
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!it.photo_required || isImage} disabled={isImage} onChange={e => patch(i, { photo_required: e.target.checked })} /> Photo Required
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!it.video_required} onChange={e => patch(i, { video_required: e.target.checked })} /> Video Required
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!it.gps_required} onChange={e => patch(i, { gps_required: e.target.checked })} /> GPS Required
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!it.time_required} onChange={e => patch(i, { time_required: e.target.checked })} /> Time Required
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!it.ai_verify} onChange={e => patch(i, { ai_verify: e.target.checked })} /> AI Verification Required
                    </label>
                  </div>
                </div>

                {showRefs && (
                  <div className="rounded-lg border border-dashed border-border p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Reference Sample Images</div>
                      <label className="cursor-pointer inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent">
                        <Upload className="h-3.5 w-3.5" /> Upload
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={async e => {
                            const files = Array.from(e.target.files ?? []);
                            for (const f of files) await uploadRef(it, f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {!it.id && (
                      <div className="text-xs text-muted-foreground">Save the checklist first to enable uploading.</div>
                    )}
                    {it.id && itemRefs.length === 0 ? (
                      <div className="text-xs text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Reference Image Not Configured — {it.ai_verify ? 'AI verification will not run for this item until a reference is added.' : 'add a sample so staff know the standard.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                        {itemRefs.map(r => (
                          <div key={r.id} className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted">
                            {r.url && <img src={r.url} alt="reference" className="w-full h-full object-cover" />}
                            <button
                              type="button"
                              onClick={() => removeRef(r)}
                              className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-red-500 hover:text-white"
                              title="Remove"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
                  <Button key={r} size="sm" variant="outline" onClick={() => assignTo('role', r)}>{r}</Button>
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
