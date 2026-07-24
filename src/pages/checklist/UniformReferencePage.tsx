import React, { useEffect, useState } from 'react';
import { Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUniformReferences, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const table = (n: string) => supabase.from(n as any);
const KINDS = ['front','back','side','cap','apron','shoes','gloves','other'] as const;

const UniformReferencePage: React.FC = () => {
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  const qc = useQueryClient();
  const { data: refs = [] } = useUniformReferences();
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      for (const r of refs as any[]) {
        const { data } = await supabase.storage.from('uniform-reference').createSignedUrl(r.storage_path, 3600);
        if (data?.signedUrl) map[r.id] = data.signedUrl;
      }
      setUrls(map);
    })();
  }, [refs]);

  const upload = async (kind: string, file: File) => {
    if (!merchantId || !user?.id) return;
    const path = `${merchantId}/${kind}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('uniform-reference').upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) return toast.error(upErr.message);
    // mark old current as not current
    await table('uniform_reference_images').update({ is_current: false }).eq('merchant_id', merchantId).eq('kind', kind);
    const { data: last } = await table('uniform_reference_images').select('version').eq('merchant_id', merchantId).eq('kind', kind).order('version', { ascending: false }).limit(1).maybeSingle();
    const version = (last?.version ?? 0) + 1;
    await table('uniform_reference_images').insert({ merchant_id: merchantId, kind, storage_path: path, version, is_current: true, uploaded_by: user.id });
    await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'uniform_reference', action: 'uploaded', meta: { kind, version } });
    toast.success(`${kind} reference uploaded (v${version})`);
    qc.invalidateQueries({ queryKey: ['uniform_refs'] });
  };

  const remove = async (r: any) => {
    if (!confirm('Remove this reference?')) return;
    await supabase.storage.from('uniform-reference').remove([r.storage_path]);
    await table('uniform_reference_images').delete().eq('id', r.id);
    qc.invalidateQueries({ queryKey: ['uniform_refs'] });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Uniform Reference Images</h1>
        <p className="text-sm text-muted-foreground">Upload your company's official uniform. The AI compares these to staff selfies for verification.</p>
      </div>
      <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
        {KINDS.map(kind => {
          const current = (refs as any[]).find(r => r.kind === kind);
          return (
            <Card key={kind} className="rounded-2xl bg-card/60 backdrop-blur">
              <CardHeader><CardTitle className="capitalize text-base flex items-center justify-between">
                {kind}
                {current && <span className="text-xs font-normal text-muted-foreground">v{current.version}</span>}
              </CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="aspect-square rounded-xl bg-muted flex items-center justify-center overflow-hidden">
                  {current && urls[current.id]
                    ? <img src={urls[current.id]} alt={kind} className="w-full h-full object-cover" />
                    : <ImageIcon className="h-10 w-10 text-muted-foreground" />}
                </div>
                <label className="w-full">
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(kind, f); }} />
                  <span className="inline-flex w-full justify-center items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer hover:bg-accent"><Upload className="h-4 w-4" /> Upload / replace</span>
                </label>
                {current && <Button variant="ghost" size="sm" className="w-full" onClick={() => remove(current)}><Trash2 className="h-4 w-4 mr-1 text-red-500" /> Remove</Button>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default UniformReferencePage;
