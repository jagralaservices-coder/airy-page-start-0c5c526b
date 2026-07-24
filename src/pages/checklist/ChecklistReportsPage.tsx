import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSubmissions } from '@/hooks/checklist/useChecklistData';
import { Trophy, AlertTriangle, Timer, CheckCircle } from 'lucide-react';

const ChecklistReportsPage: React.FC = () => {
  const { data: submissions = [], isLoading } = useSubmissions();

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const week = new Date(); week.setDate(week.getDate() - 7);
    const month = new Date(); month.setMonth(month.getMonth() - 1);
    const t = (submissions as any[]).filter(s => new Date(s.submitted_at) >= today);
    const w = (submissions as any[]).filter(s => new Date(s.submitted_at) >= week);
    const m = (submissions as any[]).filter(s => new Date(s.submitted_at) >= month);
    const failed = (submissions as any[]).filter(s => s.status === 'ai_fail' || s.status === 'rejected');
    const pending = (submissions as any[]).filter(s => s.status === 'pending');
    const scores = (submissions as any[]).map(s => Number(s.overall_score ?? 0)).filter(n => n > 0);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const byStaff: Record<string, { name: string; count: number; total: number }> = {};
    for (const s of submissions as any[]) {
      const key = s.staff_user_id;
      byStaff[key] ??= { name: s.staff_name ?? key, count: 0, total: 0 };
      byStaff[key].count++;
      byStaff[key].total += Number(s.overall_score ?? 0);
    }
    const top = Object.values(byStaff).sort((a, b) => (b.total / b.count) - (a.total / a.count)).slice(0, 5);
    return { today: t.length, week: w.length, month: m.length, failed: failed.length, pending: pending.length, avg, top };
  }, [submissions]);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const Kpi = ({ icon: Icon, label, value, tone }: any) => (
    <Card className="rounded-2xl bg-card/60 backdrop-blur">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tone}`}><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Checklist Reports</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={CheckCircle} label="Today" value={stats.today} tone="bg-emerald-500/15 text-emerald-500" />
        <Kpi icon={CheckCircle} label="This week" value={stats.week} tone="bg-blue-500/15 text-blue-500" />
        <Kpi icon={CheckCircle} label="This month" value={stats.month} tone="bg-violet-500/15 text-violet-500" />
        <Kpi icon={AlertTriangle} label="Failed / rejected" value={stats.failed} tone="bg-red-500/15 text-red-500" />
        <Kpi icon={Timer} label="Pending review" value={stats.pending} tone="bg-amber-500/15 text-amber-500" />
        <Kpi icon={Trophy} label="Avg AI score" value={`${stats.avg.toFixed(1)}%`} tone="bg-primary/15 text-primary" />
      </div>
      <Card className="rounded-2xl bg-card/60 backdrop-blur">
        <CardHeader><CardTitle>Top staff by AI score</CardTitle></CardHeader>
        <CardContent>
          {stats.top.length === 0 ? <div className="text-sm text-muted-foreground">No data yet.</div> :
          <div className="divide-y divide-border">
            {stats.top.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <span className="text-sm">{i + 1}. {s.name}</span>
                <span className="text-sm font-mono">{(s.total / s.count).toFixed(1)}% <span className="text-muted-foreground">({s.count})</span></span>
              </div>
            ))}
          </div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChecklistReportsPage;
