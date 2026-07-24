import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useSubmissions, useUniformReferences, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AiItemResultPanel, AiItemResult } from '@/components/checklist/AiItemResultPanel';
import { ImageCompareViewer } from '@/components/checklist/ImageCompareViewer';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';

const table = (n: string) => supabase.from(n as any);

const ChecklistReviewPage: React.FC = () => {
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  const qc = useQueryClient();
  const { data: submissions = [], isLoading } = useSubmissions();
  const { data: refs = [] } = useUniformReferences();

  const [compare, setCompare] = useState<{ ref: string[]; sub: string[] } | null>(null);
  const [images, setImages] = useState<Record<string, string[]>>({});
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'ai_fail' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    (async () => {
      const urls: string[] = [];
      for (const r of refs as any[]) {
        const { data } = await supabase.storage.from('uniform-reference').createSignedUrl(r.storage_path, 3600);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      setRefUrls(urls);
    })();
  }, [refs]);

  useEffect(() => {
    (async () => {
      const map: Record<string, string[]> = {};
      for (const s of submissions as any[]) {
        const { data: imgs } = await table('submission_images').select('storage_path').eq('submission_id', s.id);
        const arr: string[] = [];
        for (const im of imgs ?? []) {
          const { data } = await supabase.storage.from('staff-checklist').createSignedUrl(im.storage_path, 3600);
          if (data?.signedUrl) arr.push(data.signedUrl);
        }
        map[s.id] = arr;
      }
      setImages(map);
    })();
  }, [submissions]);

  const review = async (s: any, decision: 'approved' | 'rejected', notes?: string) => {
    if (!user?.id || !merchantId) return;
    await table('owner_reviews').insert({ submission_id: s.id, reviewer_id: user.id, decision, notes });
    await table('checklist_submissions').update({ status: decision }).eq('id', s.id);
    await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'submission', entity_id: s.id, action: decision });
    await table('checklist_notifications').insert({
      user_id: s.staff_user_id, merchant_id: merchantId, kind: decision,
      title: `Your checklist was ${decision}`, body: notes ?? '',
      payload: { submission_id: s.id },
    });
    toast.success(`Marked ${decision}`);
    qc.invalidateQueries({ queryKey: ['checklist_submissions'] });
  };

  const filtered = (submissions as any[]).filter(s => filter === 'all' ? true : s.status === filter);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">Review Submissions</h1>
        <div className="flex gap-1 flex-wrap">
          {(['all','pending','ai_fail','approved','rejected'] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>{f}</Button>
          ))}
        </div>
      </div>

      {isLoading ? <div className="text-muted-foreground">Loading…</div> :
       filtered.length === 0 ? <Card className="rounded-2xl bg-card/60 backdrop-blur"><CardContent className="p-10 text-center text-muted-foreground">No submissions.</CardContent></Card> :
       <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((s: any) => {
          const itemResults: AiItemResult[] = (s.ai_item_verification_results ?? []).map((r: any) => ({
            item_id: r.item_id,
            title: r.item_title ?? 'Item',
            status: r.status,
            confidence: r.confidence ?? null,
            reason: r.reason,
            detected_problems: r.detected_problems,
            suggestions: r.suggestions,
          }));
          return (
            <Card key={s.id} className="rounded-2xl bg-card/60 backdrop-blur">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{s.staff_name ?? 'Staff'}</CardTitle>
                    <p className="text-xs text-muted-foreground">{new Date(s.submitted_at).toLocaleString()} · {s.shift ?? '—'}</p>
                  </div>
                  <Badge variant={s.status === 'approved' ? 'default' : s.status === 'rejected' || s.status === 'ai_fail' ? 'destructive' : 'secondary'}>{s.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {images[s.id]?.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {images[s.id].slice(0, 6).map((u, i) => (
                      <img key={i} src={u} alt="sub" className="aspect-square object-cover rounded-lg border border-border" />
                    ))}
                  </div>
                )}
                <AiItemResultPanel items={itemResults} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCompare({ ref: refUrls, sub: images[s.id] ?? [] })}><Eye className="h-4 w-4 mr-1" /> Compare</Button>
                  <Button size="sm" onClick={() => review(s, 'approved')} disabled={s.status === 'approved'}><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => review(s, 'rejected', prompt('Reason?') ?? '')} disabled={s.status === 'rejected'}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>}

      {compare && <ImageCompareViewer referenceUrls={compare.ref} submittedUrls={compare.sub} onClose={() => setCompare(null)} />}
    </div>
  );
};

export default ChecklistReviewPage;
