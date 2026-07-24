import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { AiScorePanel } from '@/components/checklist/AiScorePanel';

const table = (n: string) => supabase.from(n as any);

const StaffChecklistHistoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [sub, setSub] = useState<any>(null);
  const [ai, setAi] = useState<any>(null);
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: s } = await table('checklist_submissions').select('*, ai_verification_results(*)').eq('id', id).maybeSingle();
      setSub(s); setAi(s?.ai_verification_results?.[0] ?? null);
      const { data: imgs } = await table('submission_images').select('storage_path').eq('submission_id', id);
      const urls: string[] = [];
      for (const im of (imgs ?? []) as any[]) {
        const { data } = await supabase.storage.from('staff-checklist').createSignedUrl(im.storage_path, 3600);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      setImages(urls);
    })();
  }, [id]);

  if (!sub) return <div className="p-6 text-muted-foreground">Loading…</div>;
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Submission</CardTitle>
            <Badge variant={sub.status === 'approved' ? 'default' : sub.status === 'rejected' || sub.status === 'ai_fail' ? 'destructive' : 'secondary'}>{sub.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">{new Date(sub.submitted_at).toLocaleString()}</div>
          {images.length > 0 && <div className="grid grid-cols-3 gap-2">
            {images.map((u, i) => <img key={i} src={u} alt="" className="aspect-square object-cover rounded-lg border border-border" />)}
          </div>}
          {ai && <AiScorePanel categories={ai.categories ?? {}} overall={Number(ai.overall_score ?? 0)} result={ai.result} reason={ai.reason} />}
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffChecklistHistoryPage;
