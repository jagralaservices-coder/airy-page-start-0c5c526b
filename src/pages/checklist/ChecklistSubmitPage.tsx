import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Camera, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMerchant } from '@/contexts/MerchantContext';
import { useStore } from '@/contexts/StoreContext';
import { useChecklistItems, logChecklistActivity } from '@/hooks/checklist/useChecklistData';
import { LiveCameraCapture } from '@/components/checklist/LiveCameraCapture';
import { toast } from 'sonner';
import { AiScorePanel } from '@/components/checklist/AiScorePanel';

const table = (n: string) => supabase.from(n as any);

const ChecklistSubmitPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user, userRole } = useSupabaseAuth();
  const { merchantId } = useMerchant();
  const store = useStore();
  const { data: items = [] } = useChecklistItems(id);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [images, setImages] = useState<Record<string, Blob[]>>({});
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  const setAns = (iid: string, v: any) => setAnswers(a => ({ ...a, [iid]: v }));
  const addImg = (iid: string, b: Blob) => setImages(m => ({ ...m, [iid]: [...(m[iid] ?? []), b] }));

  const submit = async () => {
    if (!user?.id || !merchantId || !id) return;
    // require selfie
    if (!selfie) { toast.error('Please capture your live selfie'); return; }
    // required items
    for (const it of items as any[]) {
      if (it.required && it.answer_type !== 'photo' && it.answer_type !== 'multi_photo' && answers[it.id] === undefined) {
        toast.error(`Answer required: ${it.title}`); return;
      }
      if (it.required && (it.photo_required || it.answer_type === 'photo' || it.answer_type === 'multi_photo') && !(images[it.id]?.length)) {
        toast.error(`Photo required: ${it.title}`); return;
      }
    }
    setBusy(true);
    try {
      const { data: sub, error } = await table('checklist_submissions').insert({
        checklist_id: id, merchant_id: merchantId, store_id: store?.activeStoreId ?? null,
        staff_user_id: user.id, staff_name: user.user_metadata?.full_name ?? user.email ?? null,
        status: 'pending', gps_lat: gps?.lat, gps_lng: gps?.lng,
      }).select('id').maybeSingle();
      if (error || !sub) throw new Error(error?.message ?? 'Insert failed');
      await logChecklistActivity({ merchant_id: merchantId, actor_id: user.id, entity_type: 'submission', entity_id: sub.id, action: 'submitted' });

      // upload selfie
      const selfiePath = `${merchantId}/${user.id}/${sub.id}/selfie-${Date.now()}.jpg`;
      await supabase.storage.from('staff-checklist').upload(selfiePath, selfie, { contentType: 'image/jpeg' });
      await table('submission_images').insert({ submission_id: sub.id, kind: 'selfie', storage_path: selfiePath });

      // answers + images
      for (const it of items as any[]) {
        if (answers[it.id] !== undefined) {
          await table('submission_answers').insert({ submission_id: sub.id, item_id: it.id, answer_json: { value: answers[it.id] } });
        }
        const bs = images[it.id] ?? [];
        for (let i = 0; i < bs.length; i++) {
          const p = `${merchantId}/${user.id}/${sub.id}/${it.id}-${i}-${Date.now()}.jpg`;
          await supabase.storage.from('staff-checklist').upload(p, bs[i], { contentType: 'image/jpeg' });
          await table('submission_images').insert({ submission_id: sub.id, item_id: it.id, kind: 'item_photo', storage_path: p });
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

      // Trigger AI verification
      toast.info('Running AI verification…');
      const { data: verifyRes, error: vErr } = await supabase.functions.invoke('verify-checklist-submission', {
        body: { submission_id: sub.id },
      });
      if (vErr) toast.error(vErr.message);
      else {
        setAiResult(verifyRes);
        toast.success(verifyRes?.result === 'pass' ? 'AI verification passed' : 'AI verification failed — pending owner review');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  if (aiResult) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold">Submission complete</h1>
        <AiScorePanel categories={aiResult.categories ?? {}} overall={Number(aiResult.overall_score ?? 0)} result={aiResult.result ?? 'fail'} reason={aiResult.reason} />
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

      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Live selfie</CardTitle></CardHeader>
        <CardContent>
          <LiveCameraCapture facing="user" label="Take selfie" onCapture={(b) => setSelfie(b)} />
          {selfie && <div className="text-xs text-emerald-500 mt-2">✓ Selfie ready</div>}
        </CardContent>
      </Card>

      {(items as any[]).map(it => (
        <Card key={it.id} className="rounded-2xl bg-card/60 backdrop-blur">
          <CardHeader><CardTitle className="text-base">{it.title}{it.required && <span className="text-red-500 ml-1">*</span>}</CardTitle>
            {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
          </CardHeader>
          <CardContent className="space-y-2">
            {it.answer_type === 'yes_no' && (
              <div className="flex gap-2">
                <Button variant={answers[it.id] === true ? 'default' : 'outline'} onClick={() => setAns(it.id, true)}>Yes</Button>
                <Button variant={answers[it.id] === false ? 'default' : 'outline'} onClick={() => setAns(it.id, false)}>No</Button>
              </div>
            )}
            {it.answer_type === 'text' && <Textarea value={answers[it.id] ?? ''} onChange={e => setAns(it.id, e.target.value)} />}
            {it.answer_type === 'number' && <Input type="number" value={answers[it.id] ?? ''} onChange={e => setAns(it.id, Number(e.target.value))} />}
            {it.answer_type === 'signature' && <Textarea placeholder="Type full name to sign" value={answers[it.id] ?? ''} onChange={e => setAns(it.id, e.target.value)} />}
            {(it.answer_type === 'photo' || it.answer_type === 'multi_photo' || it.photo_required) && (
              <>
                <LiveCameraCapture facing="environment" label="Capture photo" onCapture={(b) => addImg(it.id, b)} />
                <div className="text-xs text-muted-foreground">{(images[it.id]?.length ?? 0)} photo(s)</div>
              </>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-card/80 backdrop-blur border-t border-border">
        <div className="max-w-2xl mx-auto">
          <Button className="w-full" size="lg" onClick={submit} disabled={busy}><Send className="h-4 w-4 mr-1" /> {busy ? 'Submitting…' : 'Submit for AI verification'}</Button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistSubmitPage;
