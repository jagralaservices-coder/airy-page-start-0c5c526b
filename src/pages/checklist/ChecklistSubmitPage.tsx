import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Camera, MapPin, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMerchant } from '@/contexts/MerchantContext';
import { useStore } from '@/contexts/StoreContext';
import { useChecklistItems, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { LiveCameraCapture } from '@/components/checklist/LiveCameraCapture';
import { toast } from 'sonner';
import { AiItemResultPanel, AiItemResult } from '@/components/checklist/AiItemResultPanel';

const table = (n: string) => supabase.from(n as any);

type InputType = 'tick' | 'image' | 'tick_image' | 'text' | 'number';

const ChecklistSubmitPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useSupabaseAuth();
  const { merchantId } = useMerchant();
  const store = useStore();
  const { data: items = [] } = useChecklistItems(id);

  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [images, setImages] = useState<Record<string, Blob[]>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AiItemResult[] | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  const addImg = (iid: string, b: Blob) => setImages(m => ({ ...m, [iid]: [...(m[iid] ?? []), b] }));
  const setTick = (iid: string, v: boolean) => setTicks(t => ({ ...t, [iid]: v }));

  const validate = () => {
    for (const it of items as any[]) {
      const type: InputType = (it.input_type ?? 'tick') as InputType;
      if (!it.required) continue;
      if (type === 'tick' || type === 'tick_image') {
        if (!ticks[it.id]) { toast.error(`Please tick: ${it.title}`); return false; }
      }
      if (type === 'image' || type === 'tick_image') {
        if (!(images[it.id]?.length)) { toast.error(`Please capture image: ${it.title}`); return false; }
      }
      if (type === 'text') {
        if (!texts[it.id]?.trim()) { toast.error(`Please answer: ${it.title}`); return false; }
      }
      if (type === 'number') {
        if (numbers[it.id] === undefined || numbers[it.id] === '') { toast.error(`Please enter a number: ${it.title}`); return false; }
      }
    }
    return true;
  };

  const submit = async () => {
    if (!user?.id || !merchantId || !id) return;
    if (!validate()) return;

    setBusy(true);
    try {
      const { data: sub, error } = await table('checklist_submissions').insert({
        checklist_id: id, merchant_id: merchantId, store_id: store?.activeStoreId ?? null,
        staff_user_id: user.id, staff_name: user.user_metadata?.full_name ?? user.email ?? null,
        status: 'pending', gps_lat: gps?.lat, gps_lng: gps?.lng,
      }).select('id').maybeSingle();
      if (error || !sub) throw new Error(error?.message ?? 'Insert failed');

      await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'submission', entity_id: sub.id, action: 'submitted' });

      // per-item ticks, text, number and images
      for (const it of items as any[]) {
        const type: InputType = (it.input_type ?? 'tick') as InputType;
        if (type === 'tick' || type === 'tick_image') {
          if (ticks[it.id] !== undefined) {
            await table('submission_answers').insert({
              submission_id: sub.id, item_id: it.id, answer_json: { value: !!ticks[it.id] },
            });
          }
        }
        if (type === 'text' && texts[it.id] !== undefined) {
          await table('submission_answers').insert({
            submission_id: sub.id, item_id: it.id, answer_json: { value: texts[it.id] ?? '' },
          });
        }
        if (type === 'number' && numbers[it.id] !== undefined && numbers[it.id] !== '') {
          await table('submission_answers').insert({
            submission_id: sub.id, item_id: it.id, answer_json: { value: Number(numbers[it.id]) },
          });
        }
        const bs = images[it.id] ?? [];
        for (let i = 0; i < bs.length; i++) {
          const p = `${merchantId}/${user.id}/${sub.id}/${it.id}-${i}-${Date.now()}.jpg`;
          await supabase.storage.from('staff-checklist').upload(p, bs[i], { contentType: 'image/jpeg' });
          await table('submission_images').insert({
            submission_id: sub.id, item_id: it.id, kind: 'item_photo', storage_path: p,
          });
        }
      }

      // Notify owners of submission
      const { data: owners } = await table('user_roles').select('user_id').eq('customer_id', merchantId).in('role', ['owner','merchant','admin','store_manager']);
      const recipients = Array.from(new Set((owners as any[])?.map((o: any) => o.user_id).filter(Boolean) ?? []));
      if (recipients.length) {
        await table('checklist_notifications').insert(recipients.map((uid: string) => ({
          user_id: uid, merchant_id: merchantId, kind: 'submitted', title: 'New checklist submission',
          body: `${user.user_metadata?.full_name ?? user.email ?? 'Staff'} submitted a checklist`,
          payload: { submission_id: sub.id },
        })));
      }

      // Only run AI when at least one item has BOTH an image response type AND ai_verify=true.
      // Otherwise the checklist has no AI component and we save responses only.
      const aiItems = (items as any[]).filter(it =>
        (it.input_type === 'image' || it.input_type === 'tick_image') && it.ai_verify === true
      );
      if (aiItems.length > 0) {
        toast.info('Running AI verification…');
        const { data: verifyRes, error: vErr } = await supabase.functions.invoke('verify-checklist-submission', {
          body: { submission_id: sub.id },
        });
        if (vErr) {
          toast.error(vErr.message);
        } else {
          setResults((verifyRes?.items ?? []) as AiItemResult[]);
          setSubmissionStatus(verifyRes?.submission_status ?? null);
        }
      } else {
        setResults([]);
        setSubmissionStatus('pending');
        toast.success('Submitted.');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  if (results) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold">Submission complete</h1>
        {submissionStatus && (
          <div className="text-sm text-muted-foreground">
            Status: <span className="font-semibold text-foreground capitalize">{submissionStatus.replace('_', ' ')}</span>
          </div>
        )}
        <AiItemResultPanel items={results} />
        <Button className="w-full" onClick={() => nav('/staff/checklists')}>Done</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        {gps && <div className="ml-auto text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> GPS locked</div>}
      </div>

      {(items as any[]).map(it => {
        const type: InputType = (it.input_type ?? 'tick') as InputType;
        const needsTick = type === 'tick' || type === 'tick_image';
        const needsImage = type === 'image' || type === 'tick_image';
        return (
          <Card key={it.id} className="rounded-2xl bg-card/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base">
                {it.title}{it.required && <span className="text-red-500 ml-1">*</span>}
              </CardTitle>
              {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {type === 'tick' ? 'Tick only' : type === 'image' ? 'Image only' : 'Tick + Image'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {needsTick && (
                <button
                  type="button"
                  onClick={() => setTick(it.id, !ticks[it.id])}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-3 transition ${
                    ticks[it.id]
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-500'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  <span className="text-sm font-medium">Mark as done</span>
                  <span className={`h-6 w-6 rounded-md border flex items-center justify-center ${ticks[it.id] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border'}`}>
                    {ticks[it.id] && <Check className="h-4 w-4" />}
                  </span>
                </button>
              )}
              {needsImage && (
                <>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" /> Live camera capture required
                  </div>
                  <LiveCameraCapture facing="environment" label="Capture photo" onCapture={(b) => addImg(it.id, b)} />
                  <div className="text-xs text-muted-foreground">{(images[it.id]?.length ?? 0)} photo(s)</div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-card/80 backdrop-blur border-t border-border">
        <div className="max-w-2xl mx-auto">
          <Button className="w-full" size="lg" onClick={submit} disabled={busy}>
            <Send className="h-4 w-4 mr-1" /> {busy ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistSubmitPage;
