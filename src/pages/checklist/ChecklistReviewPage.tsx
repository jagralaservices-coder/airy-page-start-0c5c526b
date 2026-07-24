import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useSubmissions, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { useMerchant } from '@/contexts/MerchantContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AiItemResultPanel, AiItemResult } from '@/components/checklist/AiItemResultPanel';
import { ImageCompareViewer } from '@/components/checklist/ImageCompareViewer';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';

const table = (n: string) => supabase.from(n as any);

interface SubmissionImage { id: string; storage_path: string; item_id: string | null; }
interface ItemInfo { id: string; title: string; input_type: string; ai_verify: boolean; }
interface RefImage { item_id: string; storage_path: string; }

const ChecklistReviewPage: React.FC = () => {
  const { merchantId } = useMerchant();
  const { user } = useSupabaseAuth();
  const qc = useQueryClient();
  const { data: submissions = [], isLoading } = useSubmissions();

  // Per-submission: map of item_id -> signed URLs
  const [submittedByItem, setSubmittedByItem] = useState<Record<string, Record<string, string[]>>>({});
  const [referenceByItem, setReferenceByItem] = useState<Record<string, Record<string, string[]>>>({});
  const [itemsByChecklist, setItemsByChecklist] = useState<Record<string, ItemInfo[]>>({});
  const [answersBySub, setAnswersBySub] = useState<Record<string, Record<string, any>>>({});
  const [compare, setCompare] = useState<{ ref: string[]; sub: string[] } | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'ai_fail' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    (async () => {
      const subImgMap: Record<string, Record<string, string[]>> = {};
      const refImgMap: Record<string, Record<string, string[]>> = {};
      const itemsMap: Record<string, ItemInfo[]> = {};
      const answersMap: Record<string, Record<string, any>> = {};

      for (const s of submissions as any[]) {
        // Submitted images grouped by item
        const { data: imgs } = await table('submission_images')
          .select('id, storage_path, item_id')
          .eq('submission_id', s.id);
        const byItem: Record<string, string[]> = {};
        for (const im of (imgs ?? []) as SubmissionImage[]) {
          const { data } = await supabase.storage.from('staff-checklist').createSignedUrl(im.storage_path, 3600);
          if (data?.signedUrl && im.item_id) {
            (byItem[im.item_id] = byItem[im.item_id] || []).push(data.signedUrl);
          }
        }
        subImgMap[s.id] = byItem;

        // Checklist items for this submission
        if (s.checklist_id && !itemsMap[s.checklist_id]) {
          const { data: items } = await table('checklist_items')
            .select('id, title, input_type, ai_verify')
            .eq('checklist_id', s.checklist_id)
            .order('order_index', { ascending: true });
          itemsMap[s.checklist_id] = (items ?? []) as ItemInfo[];

          // Per-item reference images (owner uploaded, dynamic)
          const itemIds = (items ?? []).map((i: any) => i.id);
          if (itemIds.length) {
            const { data: refs } = await table('checklist_item_reference_images')
              .select('item_id, storage_path')
              .in('item_id', itemIds);
            const byRefItem: Record<string, string[]> = {};
            for (const r of (refs ?? []) as RefImage[]) {
              const { data } = await supabase.storage.from('uniform-reference').createSignedUrl(r.storage_path, 3600);
              if (data?.signedUrl) {
                (byRefItem[r.item_id] = byRefItem[r.item_id] || []).push(data.signedUrl);
              }
            }
            refImgMap[s.checklist_id] = byRefItem;
          }
        }

        // Tick / text / number answers
        const { data: ans } = await table('submission_answers')
          .select('item_id, answer_json')
          .eq('submission_id', s.id);
        const byAns: Record<string, any> = {};
        for (const a of (ans ?? []) as any[]) {
          if (a.item_id) byAns[a.item_id] = a.answer_json;
        }
        answersMap[s.id] = byAns;
      }

      setSubmittedByItem(subImgMap);
      setReferenceByItem(refImgMap);
      setItemsByChecklist(itemsMap);
      setAnswersBySub(answersMap);
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
          const items = itemsByChecklist[s.checklist_id] ?? [];
          const aiResultsRaw = (s.ai_item_verification_results ?? []) as any[];
          // Only render AI panel for items that actually had AI verify enabled AND produced a result.
          const aiItems: AiItemResult[] = aiResultsRaw
            .filter(r => items.some(it => it.id === r.item_id && it.ai_verify))
            .map(r => {
              const it = items.find(i => i.id === r.item_id);
              return {
                item_id: r.item_id,
                title: it?.title ?? 'Item',
                status: r.status,
                confidence: r.confidence ?? null,
                reason: r.reason,
                detected_problems: r.detected_problems,
                suggestions: r.suggestions,
              };
            });
          const subImgs = submittedByItem[s.id] ?? {};
          const refImgs = referenceByItem[s.checklist_id] ?? {};
          const answers = answersBySub[s.id] ?? {};

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
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No items defined.</p>
                ) : (
                  <div className="space-y-3">
                    {items.map(it => {
                      const type = it.input_type;
                      const isTick = type === 'tick' || type === 'tick_image';
                      const isImage = type === 'image' || type === 'tick_image';
                      const isText = type === 'text';
                      const isNumber = type === 'number';
                      const ans = answers[it.id];
                      const imgs = subImgs[it.id] ?? [];
                      const refs = refImgs[it.id] ?? [];
                      return (
                        <div key={it.id} className="rounded-lg border border-border/60 p-2 space-y-2">
                          <div className="text-sm font-medium flex items-center justify-between gap-2">
                            <span>{it.title}</span>
                            {isTick && (
                              <Badge variant={ans?.value ? 'default' : 'secondary'} className="text-[10px]">
                                {ans?.value ? 'Done' : 'Not done'}
                              </Badge>
                            )}
                          </div>
                          {(isText || isNumber) && (
                            <p className="text-xs text-muted-foreground">
                              {ans?.value !== undefined && ans?.value !== null && ans?.value !== '' ? String(ans.value) : '—'}
                            </p>
                          )}
                          {isImage && (
                            <>
                              {imgs.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2">
                                  {imgs.slice(0, 6).map((u, i) => (
                                    <img key={i} src={u} alt="submitted" className="aspect-square object-cover rounded-md border border-border" />
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No image submitted.</p>
                              )}
                              {refs.length > 0 && (
                                <Button size="sm" variant="outline" onClick={() => setCompare({ ref: refs, sub: imgs })}>
                                  <Eye className="h-3.5 w-3.5 mr-1" /> Compare with reference
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {aiItems.length > 0 && <AiItemResultPanel items={aiItems} />}

                <div className="flex flex-wrap gap-2">
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
