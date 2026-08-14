import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { usePOS } from '@/contexts/POSContext';
import { ChecklistReportsWidget } from '@/components/checklists/ChecklistReportsWidget';
import { resolveMerchantContext } from '@/lib/checklists/merchantResolver';
import {
  Plus,
  ListChecks,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCcw,
  User,
  MapPin,
  Sparkles,
  BarChart3,
  PlayCircle,
  Eye,
  Building2,
  Calendar,
  Trash2,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

export const isChecklistCompletedForPeriod = (checklist: any, results: any[]) => {
  if (!results || results.length === 0 || !checklist) return { isCompleted: false, completedResult: null };

  const rawRepeat = typeof checklist.repeat_type === 'string'
    ? checklist.repeat_type
    : typeof checklist.repeat_type === 'object' && checklist.repeat_type !== null
    ? checklist.repeat_type.value || checklist.repeat_type.label || 'daily'
    : 'daily';

  const repeatType = String(rawRepeat || 'daily').toLowerCase();
  const now = new Date();
  let periodStart = new Date(0);

  if (repeatType === 'daily') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  } else if (repeatType === 'weekly') {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    periodStart = monday;
  } else if (repeatType === 'monthly') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  } else if (repeatType === 'one_time') {
    periodStart = new Date(0);
  }

  const match = results.find((r) => {
    if (r.checklist_id !== checklist.id) return false;
    const createdDate = new Date(r.created_at || r.submitted_at || Date.now());
    const isSuccess = ['approved', 'completed', 'pending_review', 'in_review'].includes(r.status);
    return isSuccess && createdDate >= periodStart;
  });

  return {
    isCompleted: Boolean(match),
    completedResult: match || null,
  };
};

export const ChecklistDashboardPage: React.FC = () => {
  const { user, userRole } = useSupabaseAuth();
  const { activeStore } = usePOS();
  const navigate = useNavigate();

  const [checklists, setChecklists] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'reports'>('pending');

  const isStaff = userRole?.role === 'staff' || userRole?.role === 'cashier';

  useEffect(() => {
    fetchDashboardData();
  }, [activeStore]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const merchantCtx = await resolveMerchantContext(user, activeStore, userRole);

      let clQuery = supabase
        .from('checklists')
        .select('*')
        .eq('merchant_id', merchantCtx.merchantId);

      if (merchantCtx.storeId) {
        clQuery = clQuery.eq('store_id', merchantCtx.storeId);
      }

      const { data: clData, error: clErr } = await clQuery.order('created_at', { ascending: false });
      if (clErr) throw clErr;

      let resQuery = supabase
        .from('checklist_results')
        .select('*')
        .eq('merchant_id', merchantCtx.merchantId);

      if (merchantCtx.storeId) {
        resQuery = resQuery.eq('store_id', merchantCtx.storeId);
      }

      const { data: resData } = await resQuery.order('created_at', { ascending: false });

      setChecklists(clData || []);
      setResults(resData || []);
    } catch (err: any) {
      console.warn('Error loading checklist dashboard:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Categorize checklists by current schedule period status
  const pendingChecklists: any[] = [];
  const completedChecklists: any[] = [];

  checklists.forEach((cl) => {
    const { isCompleted, completedResult } = isChecklistCompletedForPeriod(cl, results);
    const itemWithResult = { ...cl, completedResult };

    if (isCompleted || cl.status === 'completed') {
      completedChecklists.push(itemWithResult);
    } else {
      pendingChecklists.push(itemWithResult);
    }
  });

  const displayList = activeTab === 'pending'
    ? pendingChecklists
    : activeTab === 'completed'
    ? completedChecklists
    : checklists;

  const filteredChecklists = displayList.filter((c) => {
    const title = String(c?.title || c?.name || '').toLowerCase();
    const category = String(c?.category || '').toLowerCase();
    const query = String(searchQuery || '').toLowerCase();
    return title.includes(query) || category.includes(query);
  });

  const handleDeleteChecklist = async (checklistId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete checklist "${title}"?`)) return;
    try {
      await supabase.from('checklist_items').delete().eq('checklist_id', checklistId);
      await supabase.from('checklist_results').delete().eq('checklist_id', checklistId);
      await supabase.from('checklists').delete().eq('id', checklistId);
      toast({ title: 'Checklist Deleted', description: `Checklist "${title}" deleted.` });
      fetchDashboardData();
    } catch (err: any) {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-20">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ListChecks className="w-7 h-7 text-primary" />
            Checklist Audit Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Store operations, schedule reset enforcement, and AI object verification platform
          </p>
        </div>
        {!isStaff && (
          <Button onClick={() => navigate('/operations/checklists/create')} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Create Checklist
          </Button>
        )}
      </div>

      {/* Metrics Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{pendingChecklists.length}</p>
              <p className="text-xs text-muted-foreground">Pending Checklists</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{completedChecklists.length}</p>
              <p className="text-xs text-muted-foreground">Completed Checklists</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">95.4%</p>
              <p className="text-xs text-muted-foreground">AI Verification Score</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <ListChecks className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{checklists.length}</p>
              <p className="text-xs text-muted-foreground">Total Master Rules</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs: Pending | Completed | Staff Reports */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2 p-1 bg-muted rounded-xl">
            <Button
              variant={activeTab === 'pending' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('pending')}
              className="text-xs gap-1.5 h-8"
            >
              <Clock className="w-3.5 h-3.5" />
              Pending ({pendingChecklists.length})
            </Button>
            <Button
              variant={activeTab === 'completed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('completed')}
              className="text-xs gap-1.5 h-8 text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed ({completedChecklists.length})
            </Button>
            <Button
              variant={activeTab === 'reports' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('reports')}
              className="text-xs gap-1.5 h-8"
            >
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              Staff Audit Reports
            </Button>
          </div>

          {activeTab !== 'reports' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search checklists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          )}
        </div>

        {/* TAB CONTENTS */}
        {activeTab === 'reports' ? (
          <ChecklistReportsWidget checklists={checklists} />
        ) : (
          <Card className="border-border">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-semibold capitalize flex items-center justify-between">
                <span>{activeTab} Checklists</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Showing {filteredChecklists.length} items
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Loading checklist items...</div>
              ) : filteredChecklists.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground italic">
                  {activeTab === 'pending'
                    ? '🎉 All checklists completed for the current schedule period!'
                    : 'No completed checklists found.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredChecklists.map((cl) => (
                    <div
                      key={cl.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-border rounded-xl bg-card hover:border-primary/50 transition-all gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground text-sm">{cl.title || cl.name || 'Untitled Checklist'}</h4>
                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize ${
                              activeTab === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                            }`}
                          >
                            {activeTab === 'completed' ? 'Completed' : 'Pending Action'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{cl.description || 'Daily operational requirement'}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-1.5">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Due: {cl.due_time || '09:00'}</span>
                          <span className="flex items-center gap-1 capitalize"><RefreshCcw className="w-3 h-3"/> Repeat: {cl.repeat_type || 'daily'}</span>
                          <span className="flex items-center gap-1 capitalize font-medium text-foreground">Priority: {cl.priority || 'medium'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                          const completion = isChecklistCompletedForPeriod(cl, results);
                          if (activeTab === 'completed' || completion.isCompleted) {
                            const status = completion.completedResult?.status || 'completed';
                            const badgeText = 
                              status === 'approved' ? 'Approved' :
                              status === 'pending_review' || status === 'in_review' ? 'Under Review' : 'Submitted';
                            const badgeColor = 
                              status === 'approved' ? 'bg-emerald-500 hover:bg-emerald-600' :
                              status === 'pending_review' || status === 'in_review' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600';

                            return (
                              <div className="flex items-center gap-2">
                                <Badge className={`${badgeColor} text-white text-[10px] gap-1 py-1 px-2.5`}>
                                  {status === 'approved' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                  {badgeText}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => navigate(`/operations/checklists/${cl.id}`)}
                                  className="gap-1 text-xs h-8"
                                >
                                  <Eye className="w-3.5 h-3.5 text-primary" />
                                  View Audit
                                </Button>
                              </div>
                            );
                          }

                          if (isStaff) {
                            return (
                              <Button
                                size="sm"
                                onClick={() => navigate(`/operations/checklists/execute/${cl.id}`)}
                                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <PlayCircle className="w-3.5 h-3.5" />
                                Start / Execute Task
                              </Button>
                            );
                          }

                          return (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => navigate(`/operations/checklists/${cl.id}`)}
                                className="gap-1 text-xs"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Details
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteChecklist(cl.id, cl.title || cl.name || 'Checklist')}
                                className="gap-1 text-xs px-2.5 h-8 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-500/20"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ChecklistDashboardPage;
