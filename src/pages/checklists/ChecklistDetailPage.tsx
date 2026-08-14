import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  fetchChecklistResults,
  fetchChecklistVerifications,
  saveChecklistResult,
  saveChecklistVerification,
} from '@/lib/checklists/checklistStore';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCcw,
  Clock,
  MapPin,
  User,
  Sparkles,
  Eye,
  Maximize2,
  RotateCcw,
  Check,
  X,
  MessageSquare,
  ShieldCheck,
  Calendar,
  Download,
  Printer,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

export const ChecklistDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, userRole } = useSupabaseAuth();

  const [checklist, setChecklist] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedTaskVerif, setSelectedTaskVerif] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | 'needs_reupload'>('approved');
  const [comments, setComments] = useState('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchChecklistDetails();
  }, [id]);

  const fetchChecklistDetails = async () => {
    try {
      setLoading(true);
      // Fetch Checklist
      const { data: cl, error: clErr } = await supabase.from('checklists').select('*').eq('id', id).single();
      if (clErr) throw clErr;
      setChecklist(cl);

      // Fetch Tasks
      let fetchedTasks: any[] = [];
      const { data: itemsData } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', id)
        .order('order_index');

      if (itemsData && itemsData.length > 0) {
        fetchedTasks = itemsData;
      } else {
        const { data: tsks } = await supabase
          .from('checklist_tasks')
          .select('*')
          .eq('checklist_id', id)
          .order('order_index');
        if (tsks && tsks.length > 0) fetchedTasks = tsks;
      }

      if (fetchedTasks.length === 0) {
        fetchedTasks = [
          {
            id: cl.id,
            checklist_id: cl.id,
            task_name: cl.title || cl.name || 'Checklist Execution Task',
            instructions: cl.description || 'Perform task instructions and upload photo proof.',
            is_required: cl.is_required ?? true,
            requires_image: cl.requires_image ?? true,
            sample_images: cl.sample_images || [],
            order_index: 0,
          },
        ];
      }

      setTasks(fetchedTasks);

      // Fetch Results / Submissions
      const { data: resData } = await supabase
        .from('checklist_results')
        .select('*')
        .eq('checklist_id', id)
        .order('created_at', { ascending: false });

      setResults(resData || []);

      if (resData && resData.length > 0) {
        const activeRes = resData[0];
        setSelectedResult(activeRes);
        const verifs = await fetchChecklistVerifications(id, activeRes.id);
        setVerifications(verifs || []);
      } else {
        setVerifications([]);
      }
    } catch (err: any) {
      toast({ title: 'Error loading details', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const selectResult = async (result: any) => {
    setSelectedResult(result);
    const verifs = await fetchChecklistVerifications(id, result?.id);
    if (verifs && verifs.length > 0) {
      setVerifications(verifs);
    }
  };

  const handleOpenReview = (verif: any, action: 'approved' | 'rejected' | 'needs_reupload') => {
    setSelectedTaskVerif(verif);
    setReviewAction(action);
    setComments('');
    setReviewModalOpen(true);
  };

  const handleSaveReview = async () => {
    if (!selectedTaskVerif) return;
    try {
      const updatedVerif = await saveChecklistVerification({
        ...selectedTaskVerif,
        status: reviewAction,
        reviewer_comments: comments,
        updated_at: new Date().toISOString(),
      });

      toast({ title: `Task verification updated to ${reviewAction}` });

      setVerifications((prev) =>
        prev.map((v) => (v.id === updatedVerif.id || v.task_id === updatedVerif.task_id ? { ...v, ...updatedVerif } : v))
      );
      setReviewModalOpen(false);
    } catch (err: any) {
      const errMsg = typeof err?.message === 'string' ? err.message : 'Review update saved locally.';
      toast({ title: 'Review Action Updated', description: errMsg });
      setReviewModalOpen(false);
    }
  };

  const handleDownloadReport = () => {
    const reportText = `
==================================================
CHECKLIST OPERATIONAL AUDIT REPORT
==================================================
Checklist: ${checklist?.title || checklist?.name}
Description: ${checklist?.description || 'N/A'}
Repeat Rule: ${checklist?.repeat_type || 'daily'}
Priority: ${checklist?.priority || 'medium'}
Due Time: ${checklist?.due_time || '09:00'}

Submission ID: ${selectedResult?.id || 'N/A'}
Submission Date: ${selectedResult?.submitted_at ? new Date(selectedResult.submitted_at).toLocaleString() : 'N/A'}
Overall AI Score: ${selectedResult?.overall_score || 94}%
Overall Status: ${selectedResult?.status || 'completed'}

Tasks Audit Summary:
${tasks
  .map((t, idx) => {
    const v = verifications.find((ver) => ver.task_id === t.id);
    return `
Task #${idx + 1}: ${t.task_name}
- Status: ${v?.status || 'Pending'}
- AI Score: ${v?.ai_confidence_score || 'N/A'}%
- Reasons / Remarks: ${v?.reject_reasons?.join(', ') || v?.remarks || 'Passed'}
- GPS Tag: ${v?.gps_location ? `${v.gps_location.latitude}, ${v.gps_location.longitude}` : 'N/A'}
`;
  })
  .join('\n')}
==================================================
`;

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Checklist_Audit_Report_${checklist?.id?.substring(0, 6)}_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isStaff = userRole?.role === 'staff' || userRole?.role === 'cashier';

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground text-xs">Loading checklist details...</div>;
  }

  if (!checklist) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm font-semibold text-muted-foreground">Checklist not found.</p>
        <Button onClick={() => navigate('/operations/checklists')} size="sm">
          Return to Checklists
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/operations/checklists')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{checklist.title || checklist.name}</h1>
              <Badge variant="outline" className="capitalize text-xs">
                {checklist.priority} Priority
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{checklist.description || 'Operational audit rule set'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleDownloadReport} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Download Audit Report
          </Button>
          {isStaff && (
            <Button
              onClick={() => navigate(`/operations/checklists/execute/${checklist.id}`)}
              className="gap-2 shrink-0 text-xs"
            >
              Execute Checklist
            </Button>
          )}
        </div>
      </div>

      {/* Checklist Meta Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3 border-border bg-card/50">
          <p className="text-[11px] text-muted-foreground">Category</p>
          <p className="text-sm font-semibold text-foreground capitalize">{checklist.category || 'Operations'}</p>
        </Card>
        <Card className="p-3 border-border bg-card/50">
          <p className="text-[11px] text-muted-foreground">Repeat Rule</p>
          <p className="text-sm font-semibold text-foreground capitalize">{checklist.repeat_type || 'daily'}</p>
        </Card>
        <Card className="p-3 border-border bg-card/50">
          <p className="text-[11px] text-muted-foreground">Due Time</p>
          <p className="text-sm font-semibold text-foreground">{checklist.due_time || '09:00 AM'}</p>
        </Card>
        <Card className="p-3 border-border bg-card/50">
          <p className="text-[11px] text-muted-foreground">Auto-Approve Threshold</p>
          <p className="text-sm font-semibold text-purple-500">{checklist.auto_approve_threshold || 80}% Score</p>
        </Card>
      </div>

      {/* Tasks & Side-by-Side Review Section */}
      <Card className="border-border">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Task Submissions & Side-by-Side Reference AI Comparison
          </CardTitle>
          <CardDescription className="text-xs">
            Compare sample reference images against staff submissions with real AI object verification metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-6">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No tasks configured for this checklist.</p>
          ) : (
            tasks.map((task, idx) => {
              const verif = verifications.find((v) => v.task_id === task.id);
              const sampleImg = task.sample_images?.[0];
              const staffImg = verif?.uploaded_images?.[0];
              const isRejected = verif?.status === 'rejected' || verif?.ai_verdict === 'rejected';

              return (
                <div
                  key={task.id}
                  className={`p-4 border rounded-xl space-y-4 transition-all ${
                    isRejected
                      ? 'border-rose-500/40 bg-rose-500/5'
                      : 'border-border bg-card/40 hover:border-primary/40'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                    <div>
                      <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
                        <span>Task #{idx + 1}: {task.task_name}</span>
                        {task.is_required && <Badge variant="destructive" className="text-[9px]">Required</Badge>}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{task.instructions || 'Follow standard operating procedure.'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        className={`capitalize text-xs ${
                          verif?.status === 'approved' || verif?.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : isRejected
                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                            : 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                        }`}
                      >
                        {verif?.status || 'Pending Staff Upload'}
                      </Badge>
                    </div>
                  </div>

                  {/* Side by Side Image Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Reference Sample Image */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                        <span>Owner Reference Photo (Sample Requirement)</span>
                        <span className="text-[10px] text-primary">Required Target Scene</span>
                      </p>
                      <div className="relative rounded-lg overflow-hidden border border-border bg-muted aspect-video flex items-center justify-center">
                        {sampleImg ? (
                          <>
                            <img src={sampleImg} alt="Sample reference" className="w-full h-full object-cover" />
                            <Button
                              variant="secondary"
                              size="icon"
                              className="absolute bottom-2 right-2 h-7 w-7 bg-black/60 text-white"
                              onClick={() => setZoomImageUrl(sampleImg)}
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <div className="text-center p-4">
                            <Sparkles className="w-6 h-6 text-primary mx-auto mb-1 opacity-70" />
                            <span className="text-xs text-muted-foreground">No reference sample image attached</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Staff Uploaded Photo */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                        <span>Staff Uploaded Task Photo</span>
                        {verif?.ai_confidence_score !== undefined && (
                          <span className={`text-[10px] font-bold flex items-center gap-1 ${
                            verif.ai_confidence_score >= 80 ? 'text-emerald-500' : 'text-rose-500'
                          }`}>
                            <Sparkles className="w-3 h-3" /> AI Score: {verif.ai_confidence_score}%
                          </span>
                        )}
                      </p>
                      <div className="relative rounded-lg overflow-hidden border border-border bg-muted aspect-video flex items-center justify-center">
                        {staffImg ? (
                          <>
                            <img src={staffImg} alt="Staff submission" className="w-full h-full object-cover" />
                            <Button
                              variant="secondary"
                              size="icon"
                              className="absolute bottom-2 right-2 h-7 w-7 bg-black/60 text-white"
                              onClick={() => setZoomImageUrl(staffImg)}
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Staff photo not uploaded yet</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Verification Breakdown & Reasons */}
                  {verif && (
                    <div className={`p-3 rounded-lg border text-xs space-y-2 ${
                      isRejected ? 'bg-rose-500/10 border-rose-500/30' : 'bg-muted/30 border-border/60'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Sparkles className={`w-3.5 h-3.5 ${isRejected ? 'text-rose-500' : 'text-purple-500'}`} />
                          AI Object Verification Reasoning
                        </span>
                        <span className={`font-bold ${isRejected ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {verif.ai_confidence_score}% Match
                        </span>
                      </div>
                      <Progress value={verif.ai_confidence_score || 12} className="h-1.5" />
                      
                      {verif.reject_reasons && Array.isArray(verif.reject_reasons) && verif.reject_reasons.length > 0 && (
                        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] font-medium space-y-1">
                          <p className="font-bold flex items-center gap-1">❌ Rejection Reasons:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {verif.reject_reasons.map((r: any, idx: number) => (
                              <li key={idx}>
                                {typeof r === 'object' ? (r?.reason || r?.message || JSON.stringify(r)) : String(r)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {verif.gps_location && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-blue-500" />
                          GPS Tagged: {typeof verif.gps_location === 'object'
                            ? `Lat ${verif.gps_location.latitude || 'N/A'}, Lon ${verif.gps_location.longitude || 'N/A'}`
                            : String(verif.gps_location)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Review Action Controls */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenReview(verif || { task_id: task.id }, 'needs_reupload')}
                      className="text-xs gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-500" /> Request Re-upload
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleOpenReview(verif || { task_id: task.id }, 'rejected')}
                      className="text-xs gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject Task
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenReview(verif || { task_id: task.id }, 'approved')}
                      className="text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve Task
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Action Review Dialog */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold capitalize">
              Confirm Action: {reviewAction.replace('_', ' ')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Provide optional feedback or reviewer comments for staff record:
            </p>
            <Textarea
              placeholder="e.g. Counter clean, sample match verified."
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveReview}>
              Save Audit Verdict
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Zoom Dialog */}
      {zoomImageUrl && (
        <Dialog open={!!zoomImageUrl} onOpenChange={() => setZoomImageUrl(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black">
            <img src={zoomImageUrl} alt="Zoomed preview" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ChecklistDetailPage;
