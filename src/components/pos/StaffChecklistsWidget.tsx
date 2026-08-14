import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ListTodo, CheckCircle2, AlertCircle, RefreshCcw, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export const StaffChecklistsWidget: React.FC = () => {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<number>(0);
  const [avgRating, setAvgRating] = useState<string>('N/A');
  const [staffId, setStaffId] = useState<string | null>(null);

  useEffect(() => {
    fetchChecklists();
  }, [user]);

  const fetchChecklists = async () => {
    try {
      setLoading(true);

      // 1. Fetch assigned checklists
      let clIds: string[] = [];
      let resolvedStaffId = user?.id || null;

      if (user?.id) {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .or(`user_id.eq.${user.id},id.eq.${user.id}`)
          .maybeSingle();

        resolvedStaffId = staffData?.id || user.id;
        setStaffId(resolvedStaffId);

        const { data: assignments } = await supabase
          .from('checklist_assignments')
          .select('checklist_id')
          .eq('staff_id', resolvedStaffId);

        if (assignments && assignments.length > 0) {
          clIds = assignments.map((a) => a.checklist_id);
        }
      }

      // Calculate staff rating and points
      if (resolvedStaffId) {
        const { data: staffRes } = await supabase
          .from('checklist_results')
          .select('overall_score')
          .eq('staff_id', resolvedStaffId)
          .in('status', ['approved', 'completed']);

        const completedCount = staffRes?.length || 0;
        setPoints(completedCount * 10);
        
        const totalScore = staffRes?.reduce((acc, r) => acc + (r.overall_score || 0), 0) || 0;
        setAvgRating(completedCount > 0 ? Math.round(totalScore / completedCount) + '%' : 'N/A');
      }

      // 2. Query active checklists
      let query = supabase.from('checklists').select('*').neq('status', 'cancelled');
      if (clIds.length > 0) {
        query = query.in('id', clIds);
      } else {
        query = query.limit(20);
      }

      const { data: clData } = await query;
      setChecklists(clData || []);
    } catch (error) {
      console.error('Error fetching checklists', error);
      setChecklists([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-xl sm:rounded-2xl border border-border p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base text-foreground">
          <ListTodo className="w-4 h-4 text-primary" />
          Daily Store Operations Checklists
        </h3>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/operations/checklists')}
            className="text-xs h-7 px-2.5"
          >
            View All
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchChecklists} className="h-7 w-7">
            <RefreshCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Staff Rating & Points Header Widget */}
      {staffId && (
        <div className="grid grid-cols-2 gap-3 p-3 mb-4 rounded-xl border border-primary/20 bg-primary/5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div>
              <p className="text-muted-foreground font-medium">My Points</p>
              <p className="text-sm font-bold text-foreground">{points} Pts</p>
            </div>
          </div>
          <div className="flex items-center gap-2 border-l border-border pl-3">
            <span className="text-xl">⭐</span>
            <div>
              <p className="text-muted-foreground font-medium">Avg AI Score</p>
              <p className="text-sm font-bold text-foreground">{avgRating}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading operational checklists...</p>
        ) : checklists.length === 0 ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-xs text-muted-foreground">No active checklists assigned to you right now.</p>
            <Button size="sm" variant="outline" onClick={() => navigate('/operations/checklists')} className="text-xs">
              Open Checklists Center
            </Button>
          </div>
        ) : (
          checklists.map((cl) => (
            <button
              key={cl.id}
              onClick={() => navigate(`/operations/checklists/execute/${cl.id}`)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary/60 hover:bg-secondary transition-all text-left border border-border/40"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-xs sm:text-sm text-foreground">{cl.title || cl.name}</p>
                  <Badge variant="outline" className="text-[9px] capitalize">{cl.repeat_type || 'Daily'}</Badge>
                </div>
                <div className="flex gap-2 text-[11px] text-muted-foreground mt-1">
                  <span className="capitalize">{cl.category || 'Operations'}</span>
                  <span>•</span>
                  <span>Due: {cl.due_time || '09:00 AM'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-primary text-xs font-semibold">
                <span>Start</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
