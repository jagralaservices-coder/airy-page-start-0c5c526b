import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Copy, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useChecklists, useInvalidateChecklists, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { toast } from 'sonner';
import { NewChecklistDialog } from '@/components/checklist/NewChecklistDialog';

const table = (n: string) => supabase.from(n as any);

const ChecklistLibraryPage: React.FC = () => {
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  const nav = useNavigate();
  const { data: lists = [], isLoading } = useChecklists();
  const invalidate = useInvalidateChecklists();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(
    () => lists.filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase())),
    [lists, search]
  );

  const createNew = async (payload: { name: string; shift_type: string; frequency: string }) => {
    if (!merchantId || !user?.id) { toast.error('Not signed in'); return; }
    const { data, error } = await table('checklists').insert({
      merchant_id: merchantId,
      name: payload.name,
      description: '',
      department: '',
      category: payload.shift_type,
      shift_type: payload.shift_type,
      frequency: payload.frequency,
      is_active: true,
      created_by: user.id,
    }).select('id').maybeSingle();
    if (error || !data) { toast.error(error?.message ?? 'Failed'); return; }
    await logChecklistActivity({
      merchant_id: merchantId, actor_id: user.id,
      entity_type: 'checklist', entity_id: data.id, action: 'created',
      meta: payload,
    });
    invalidate();
    nav(`/checklists/${data.id}/edit`);
  };

  const del = async (id: string) => {
    if (!confirm('Delete this checklist?')) return;
    const { error } = await table('checklists').delete().eq('id', id);
    if (error) return toast.error(error.message);
    if (merchantId && user?.id) {
      await logChecklistActivity({
        merchant_id: merchantId, actor_id: user.id,
        entity_type: 'checklist', entity_id: id, action: 'deleted',
      });
    }
    toast.success('Deleted');
    invalidate();
  };

  const duplicate = async (c: any) => {
    if (!merchantId || !user?.id) return;
    const { data: dup } = await table('checklists').insert({
      merchant_id: merchantId, name: `${c.name} (copy)`, description: c.description,
      department: c.department, category: c.category, frequency: c.frequency,
      is_active: true, created_by: user.id,
    }).select('id').maybeSingle();
    if (!dup) return;
    const { data: items } = await table('checklist_items').select('*').eq('checklist_id', c.id);
    if (items?.length) {
      await table('checklist_items').insert(items.map((it: any) => ({
        ...it, id: undefined, checklist_id: dup.id, created_at: undefined, updated_at: undefined,
      })));
    }
    toast.success('Duplicated');
    invalidate();
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-7 w-7" /> Staff Checklists
          </h1>
          <p className="text-sm text-muted-foreground">
            Build fully dynamic checklists. AI verification only runs on the items you configure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
          <Button onClick={createNew} disabled={creating}>
            <Plus className="h-4 w-4 mr-1" /> {creating ? 'Creating…' : 'New checklist'}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
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
            <p className="text-muted-foreground">No checklists yet.</p>
            <Button onClick={createNew} disabled={creating}>
              <Plus className="h-4 w-4 mr-1" /> New checklist
            </Button>
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
                <div className="text-xs text-muted-foreground">
                  {c.category ? `${c.category}` : ''}{c.category && c.department ? ' • ' : ''}{c.department || (!c.category ? '—' : '')}
                </div>
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
    </div>
  );
};

export default ChecklistLibraryPage;
