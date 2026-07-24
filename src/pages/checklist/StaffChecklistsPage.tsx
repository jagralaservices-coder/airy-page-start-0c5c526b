import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { useAssignedChecklistsForMe, useSubmissions } from '@/hooks/checklist/useChecklistData';

const StaffChecklistsPage: React.FC = () => {
  const { data: lists = [], isLoading } = useAssignedChecklistsForMe();
  const { data: recent = [] } = useSubmissions({ staffOnly: true });

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><ClipboardList className="h-7 w-7" /> My Checklists</h1>
      {isLoading ? <div className="text-muted-foreground">Loading…</div> :
        lists.length === 0 ? <Card className="rounded-2xl bg-card/60 backdrop-blur"><CardContent className="p-8 text-center text-muted-foreground">No checklists assigned to you yet.</CardContent></Card> :
        <div className="space-y-3">
          {(lists as any[]).map(c => (
            <Link to={`/staff/checklists/${c.id}`} key={c.id} className="block">
              <Card className="rounded-2xl bg-card/60 backdrop-blur hover:shadow-lg transition">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    {c.description && <div className="text-sm text-muted-foreground">{c.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.frequency}</Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>}

      <div>
        <h2 className="text-lg font-semibold mt-6 mb-2">My recent submissions</h2>
        <div className="space-y-2">
          {(recent as any[]).slice(0, 10).map((s: any) => (
            <Link to={`/staff/checklists/history/${s.id}`} key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card/40 backdrop-blur px-4 py-2 text-sm hover:bg-card/60">
              <span>{new Date(s.submitted_at).toLocaleString()}</span>
              <Badge variant={s.status === 'approved' ? 'default' : s.status === 'rejected' || s.status === 'ai_fail' ? 'destructive' : 'secondary'}>{s.status}</Badge>
            </Link>
          ))}
          {recent.length === 0 && <div className="text-sm text-muted-foreground">No history yet.</div>}
        </div>
      </div>
    </div>
  );
};

export default StaffChecklistsPage;
