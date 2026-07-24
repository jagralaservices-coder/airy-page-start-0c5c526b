import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useMerchant } from '@/contexts/MerchantContext';

const ChecklistAuditPage: React.FC = () => {
  const { merchantId } = useMerchant();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const { data } = await supabase.from('checklist_activity_logs' as any).select('*').eq('merchant_id', merchantId).order('created_at', { ascending: false }).limit(200);
      setRows((data as any[]) ?? []);
    })();
  }, [merchantId]);
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Audit Log</h1>
      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border">
          {rows.length === 0 && <div className="text-sm text-muted-foreground py-4">No activity yet.</div>}
          {rows.map(r => (
            <div key={r.id} className="py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="font-medium">{r.action}</span>
                <span className="text-muted-foreground ml-2">{r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0,8)}` : ''}</span>
              </div>
              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChecklistAuditPage;
