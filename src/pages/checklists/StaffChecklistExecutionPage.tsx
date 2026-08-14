import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { usePOS } from '@/contexts/POSContext';
import { processChecklistImage } from '@/lib/checklists/imageProcessor';
import { performAIVerification } from '@/lib/checklists/aiVerification';
import {
  fetchChecklistResults,
  fetchChecklistVerifications,
  saveChecklistResult,
  saveChecklistVerification,
} from '@/lib/checklists/checklistStore';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Building2,
  Sparkles,
  AlertTriangle,
  Loader2,
  MapPin,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

export const StaffChecklistExecutionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const { activeStore } = usePOS();

  const [checklist, setChecklist] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [resultId, setResultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Active step task index
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

  const [taskStates, setTaskStates] = useState<Record<string, any>>({});
  const [uploadingTask, setUploadingTask] = useState<string | null>(null);
  const [isSubmittedToday, setIsSubmittedToday] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);

  useEffect(() => {
    if (id) loadChecklistAndResult();
  }, [id]);

  const loadChecklistAndResult = async () => {
    try {
      setLoading(true);
      // Load Checklist
      const { data: clData, error: clError } = await supabase.from('checklists').select('*').eq('id', id).single();
      if (clError) throw clError;
      setChecklist(clData);

      // Check if already submitted today (local calendar day timezone-aware)
      const now = new Date();
      const localTodayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayStart = localTodayStart.toISOString();

      const { data: doneResult } = await supabase
        .from('checklist_results')
        .select('*')
        .eq('checklist_id', id)
        .gte('created_at', todayStart)
        .in('status', ['approved', 'completed', 'pending_review', 'in_review'])
        .maybeSingle();

      if (doneResult || clData.status === 'completed') {
        setIsSubmittedToday(true);
        if (doneResult) {
          setResultId(doneResult.id);
          setSelectedResult(doneResult);
        }
      }

      // Load Tasks with 3-layer fallback
      let fetchedTasks: any[] = [];

      const { data: itemsData } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', id)
        .order('order_index');

      if (itemsData && itemsData.length > 0) {
        fetchedTasks = itemsData;
      } else {
        const { data: tasksData } = await supabase
          .from('checklist_tasks')
          .select('*')
          .eq('checklist_id', id)
          .order('order_index');

        if (tasksData && tasksData.length > 0) {
          fetchedTasks = tasksData;
        }
      }

      if (fetchedTasks.length === 0) {
        fetchedTasks = [
          {
            id: clData.id,
            checklist_id: clData.id,
            task_name: clData.title || clData.name || 'Checklist Execution Task',
            instructions: clData.description || 'Perform task instructions and upload photo proof.',
            is_required: clData.is_required ?? true,
            requires_image: clData.requires_image ?? true,
            sample_images: clData.sample_images || [],
            order_index: 0,
          },
        ];
      }

      setTasks(fetchedTasks);

      // Get or create checklist submission result record for today
      const { data: existingResult } = await supabase
        .from('checklist_results')
        .select('*')
        .eq('checklist_id', id)
        .order('created_at', { ascending: false })
        .maybeSingle();

      let activeResId = null;

      if (existingResult) {
        const isFromToday = new Date(existingResult.created_at) >= localTodayStart;
        const isCompleted = ['approved', 'completed', 'pending_review', 'in_review'].includes(existingResult.status);

        if (isFromToday) {
          activeResId = existingResult.id;
          if (isCompleted) {
            setIsSubmittedToday(true);
            setSelectedResult(existingResult);
          }
        }
      }

      if (!activeResId) {
        const { data: newRes } = await supabase
          .from('checklist_results')
          .insert({
            checklist_id: id,
            merchant_id: clData.merchant_id,
            store_id: clData.store_id || activeStore?.id || null,
            status: 'in_progress',
            total_tasks_count: fetchedTasks?.length || 1,
            created_by: user?.id || null,
          })
          .select()
          .single();

        if (newRes) activeResId = newRes.id;
      }

      if (activeResId) {
        setResultId(activeResId);
        const { data: verifs } = await supabase
          .from('checklist_verifications')
          .select('*')
          .eq('result_id', activeResId);

        const stateMap: Record<string, any> = {};
        verifs?.forEach((v) => {
          stateMap[v.task_id] = {
            imageUrl: v.uploaded_images?.[0],
            status: v.status,
            aiConfidence: v.ai_confidence_score,
            remarks: v.remarks,
            aiVerdict: v.ai_verdict,
            rejectReasons: v.reject_reasons,
          };
        });
        setTaskStates(stateMap);
      }
    } catch (err: any) {
      toast({ title: 'Error loading checklist', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleImageCapture = async (taskId: string, file: File) => {
    try {
      setUploadingTask(taskId);
      toast({ title: 'Processing Photo', description: 'Compressing and evaluating image quality...' });

      // Create instant Data URL for 100% reliable image preview
      const localDataUrl = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res((reader.result as string) || '');
        reader.readAsDataURL(file);
      });

      // 1. Process Image: Compression, Hashing, GPS capture
      const processed = await processChecklistImage(file);

      // 2. Upload to Supabase Storage with Data URL fallback
      let staffImageUrl = localDataUrl;
      try {
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `task_${taskId}_${Date.now()}.${fileExt}`;
        const filePath = `staff_submissions/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('checklist-images')
          .upload(filePath, processed.compressedBlob, { cacheControl: '3600', upsert: true });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from('checklist-images')
            .getPublicUrl(filePath);
          if (urlData?.publicUrl) {
            staffImageUrl = urlData.publicUrl;
          }
        }
      } catch (stgErr) {
        console.warn('Storage upload fallback to Data URL:', stgErr);
      }

      // 3. Guaranteed Result Record ID
      let activeResId = resultId;
      if (!activeResId) {
        const { data: newRes } = await supabase
          .from('checklist_results')
          .insert({
            checklist_id: id,
            merchant_id: checklist.merchant_id,
            store_id: checklist.store_id || activeStore?.id || null,
            status: 'in_progress',
            total_tasks_count: tasks.length || 1,
            created_by: user?.id || null,
          })
          .select('id')
          .single();
        if (newRes?.id) {
          activeResId = newRes.id;
          setResultId(newRes.id);
        }
      }

      // 4. Real AI Photo Verification calling verify-checklist-item Edge Function
      const taskObj = tasks.find((t) => t.id === taskId);
      const combinedTaskContext = `${taskObj?.task_name || ''} ${taskObj?.instructions || ''} ${checklist?.title || ''}`;

      let aiResult;
      try {
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('verify-checklist-item', {
          body: {
            capturedImage: staffImageUrl,
            sampleImages: taskObj?.sample_images || [],
            taskInstructions: combinedTaskContext,
            acceptanceRate: checklist?.auto_approve_threshold || 80
          }
        });

        if (edgeErr || !edgeData || !edgeData.success) {
          throw new Error(edgeErr?.message || edgeData?.error || 'AI verification failed');
        }

        aiResult = {
          confidenceScore: edgeData.confidence,
          verdict: edgeData.verdict === 'approved' ? 'auto_approved' : edgeData.verdict === 'rejected' ? 'rejected' : 'review_required',
          metrics: {
            objectMatchScore: edgeData.confidence,
            cleanlinessScore: edgeData.cleanliness,
            placementScore: edgeData.confidence,
            equipmentScore: edgeData.confidence,
            angleScore: edgeData.confidence,
            completionScore: edgeData.confidence,
            environmentScore: edgeData.confidence
          },
          matchedObjects: edgeData.verdict === 'approved' ? ['Verified Object'] : [],
          missingObjects: edgeData.verdict === 'rejected' ? ['Compliant Scene'] : [],
          rejectReasons: edgeData.rejectReasons || [],
          summary: edgeData.summary || '',
          isDefective: edgeData.verdict === 'rejected'
        };
      } catch (err) {
        console.warn('[AI Verification] Edge function failed, falling back to local simulation:', err);
        aiResult = await performAIVerification(
          staffImageUrl,
          taskObj?.sample_images || [],
          checklist?.auto_approve_threshold || 80,
          {
            taskInstructions: combinedTaskContext,
            imageHash: processed.imageHash,
          }
        );
      }

      // 5. Save/Update Verification Record resiliently
      await saveChecklistVerification({
        result_id: resultId || `res_${id}`,
        task_id: taskId,
        checklist_id: id,
        merchant_id: checklist.merchant_id,
        store_id: checklist.store_id || activeStore?.id || null,
        status: aiResult.verdict === 'auto_approved' ? 'approved' : aiResult.verdict === 'rejected' ? 'rejected' : 'pending',
        uploaded_images: [staffImageUrl || localDataUrl],
        ai_confidence_score: aiResult.confidenceScore,
        ai_verdict: aiResult.verdict,
        ai_metrics: aiResult.metrics,
        reject_reasons: aiResult.rejectReasons,
        gps_location: processed.gpsLocation || null,
        timestamp: new Date().toISOString(),
        created_by: user?.id || null,
      });

      // Update Local React State
      setTaskStates((prev) => ({
        ...prev,
        [taskId]: {
          imageUrl: localDataUrl || staffImageUrl,
          status: aiResult.verdict === 'auto_approved' ? 'approved' : aiResult.verdict === 'rejected' ? 'rejected' : 'completed',
          aiConfidence: aiResult.confidenceScore,
          aiVerdict: aiResult.verdict,
          rejectReasons: aiResult.rejectReasons,
          aiResult,
        },
      }));

      if (aiResult.isDefective || aiResult.verdict === 'rejected') {
        toast({
          title: '❌ AI Verification Rejected',
          description: aiResult.summary || 'Uploaded photo does not match required equipment.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Photo Uploaded & Evaluated',
          description: `AI Score: ${aiResult.confidenceScore}%.`,
        });
      }
    } catch (err: any) {
      const errMsg = typeof err?.message === 'string' ? err.message : 'Image upload failed';
      toast({ title: 'Image Upload Failed', description: errMsg, variant: 'destructive' });
    } finally {
      setUploadingTask(null);
    }
  };

  const handleCompleteChecklist = async () => {
    const requiredUnfinished = tasks.filter((t) => {
      const state = taskStates[t.id];
      const verificationType = t.verification_type || (
        t.requires_image && t.is_required ? 'image_and_tick' :
        t.requires_image ? 'only_image' :
        t.is_required ? 'only_tick' : 'all_ok'
      );

      if (verificationType === 'image_and_tick') {
        return !state?.imageUrl || !state?.ticked;
      }
      if (verificationType === 'only_image') {
        return !state?.imageUrl;
      }
      if (verificationType === 'only_tick') {
        return !state?.ticked;
      }
      return false;
    });

    if (requiredUnfinished.length > 0) {
      toast({
        title: 'Incomplete Required Tasks',
        description: `Please complete all tasks (photos or ticks) before submitting.`,
        variant: 'destructive',
      });
      return;
    }

    const rejectedTasks = Object.values(taskStates).filter((s: any) => s?.aiVerdict === 'rejected');
    if (rejectedTasks.length > 0) {
      toast({
        title: 'Submission Blocked by AI Rejection',
        description: 'Cannot submit checklist. One or more task photos were rejected by AI object verification. Please retake photo with required object.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);

      const completedCount = Object.values(taskStates).filter((s: any) => s?.imageUrl).length;
      const taskScores = Object.values(taskStates)
        .map((s: any) => s?.aiConfidence || s?.aiResult?.confidenceScore || 85)
        .filter((score: number) => typeof score === 'number');

      const avgScore = taskScores.length > 0
        ? Math.round(taskScores.reduce((a: number, b: number) => a + b, 0) / taskScores.length)
        : 85;

      const threshold = Number(checklist?.auto_approve_threshold) || 80;
      const isAutoApproved = avgScore >= threshold;
      const finalStatus = isAutoApproved ? 'approved' : 'pending_review';

      if (resultId) {
        const { data: updatedRes } = await supabase
          .from('checklist_results')
          .update({
            status: finalStatus,
            submitted_at: new Date().toISOString(),
            approved_at: isAutoApproved ? new Date().toISOString() : null,
            approved_by: isAutoApproved ? 'AI Auto-Approval Engine' : null,
            completed_tasks_count: completedCount,
            overall_score: avgScore,
            updated_at: new Date().toISOString(),
          })
          .eq('id', resultId)
          .select()
          .single();

        if (updatedRes) {
          setSelectedResult(updatedRes);
        }
      }

      if (checklist?.id) {
        await supabase
          .from('checklists')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', checklist.id);
      }

      setIsSubmittedToday(true);

      toast({
        title: isAutoApproved ? 'Checklist Auto-Approved! 🎉' : 'Checklist Submitted!',
        description: isAutoApproved
          ? `AI Score (${avgScore}%) met threshold (${threshold}%). Completed & auto-approved.`
          : `Checklist submitted with AI Score ${avgScore}%. Sent for manager review.`,
      });

      navigate('/operations/checklists');
    } catch (err: any) {
      toast({ title: 'Submission Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground text-xs">Loading checklist tasks...</div>;
  }

  const currentTask = tasks[currentTaskIndex] || tasks[0];
  const completedTasksCount = Object.values(taskStates).filter((s: any) => s?.imageUrl).length;
  const progressPercent = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto pb-24">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => navigate('/operations/checklists')} className="gap-1.5 text-xs">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
      </div>

      {isSubmittedToday ? (
        <Card className="border-border shadow-sm">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Completed & Locked for Today</h2>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                You have already submitted this checklist today. Submissions are locked until the next schedule reset tomorrow.
              </p>
            </div>
            {selectedResult && (
              <div className="p-4 rounded-xl border border-border bg-muted/40 max-w-sm mx-auto text-xs space-y-2 text-left">
                <p className="font-semibold text-foreground border-b border-border pb-1.5 flex items-center justify-between">
                  <span>Submission Summary</span>
                  <Badge variant={selectedResult.status === 'approved' ? 'default' : 'secondary'} className="text-[10px] capitalize">
                    {selectedResult.status}
                  </Badge>
                </p>
                <div className="space-y-1.5">
                  <p className="text-muted-foreground flex justify-between">
                    <span>Submitted Time:</span>
                    <span className="font-medium text-foreground">
                      {selectedResult.submitted_at ? new Date(selectedResult.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </span>
                  </p>
                  <p className="text-muted-foreground flex justify-between">
                    <span>AI Audit Score:</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">{selectedResult.overall_score || 0}%</span>
                  </p>
                  <p className="text-muted-foreground flex justify-between">
                    <span>Completed Tasks:</span>
                    <span className="font-medium text-foreground">{selectedResult.completed_tasks_count} / {selectedResult.total_tasks_count}</span>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Checklist Overview & Progress */}
          <Card className="border-border">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    {checklist?.title || checklist?.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">{checklist?.description || 'Daily store operational requirement'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">{checklist?.category || 'Operations'}</Badge>
                  <Badge variant="secondary" className="text-xs uppercase">{checklist?.priority || 'Medium'} Priority</Badge>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pt-2 border-t border-border/50">
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Due: {checklist?.due_time || '09:00 AM'}</span>
                  <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5"/> {activeStore?.name || 'Active Store'}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">{progressPercent}% Completed</p>
                  <p className="text-[11px] text-muted-foreground">{completedTasksCount} of {tasks.length} tasks finished</p>
                </div>
              </div>
              <Progress value={progressPercent} className="h-2 bg-muted" />
            </CardContent>
          </Card>

          {/* Task Execution Card */}
          {currentTask && (
            <Card className="border-border">
              <CardHeader className="pb-3 border-b border-border/50 flex flex-row justify-between items-center">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Task {currentTaskIndex + 1} of {tasks.length}: {currentTask.task_name}
                  </CardTitle>
                  <CardDescription className="text-xs">{currentTask.instructions || 'Perform task as instructed.'}</CardDescription>
                </div>
                {currentTask.is_required && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
              </CardHeader>

              <CardContent className="p-5 space-y-5">
                {/* Task Reference Image Preview if exists */}
                {currentTask.sample_images && currentTask.sample_images.length > 0 && (
                  <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Sample Reference Photo (Required Standard)
                    </p>
                    <div className="flex gap-2 overflow-x-auto">
                      {currentTask.sample_images.map((imgUrl: string, idx: number) => (
                        <img
                          key={idx}
                          src={imgUrl}
                          alt="Sample"
                          className="w-28 h-20 object-cover rounded-lg border border-border"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Checkbox Tick Option */}
                {currentTask.is_required && (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card">
                    <input
                      type="checkbox"
                      id={`tick-${currentTask.id}`}
                      checked={taskStates[currentTask.id]?.ticked || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTaskStates((prev) => ({
                          ...prev,
                          [currentTask.id]: {
                            ...prev[currentTask.id],
                            ticked: checked,
                            status: checked ? 'completed' : 'pending'
                          }
                        }));
                      }}
                      className="w-5 h-5 rounded border-input text-primary focus:ring-primary cursor-pointer"
                    />
                    <Label htmlFor={`tick-${currentTask.id}`} className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground">
                      I have completed and verified this task.
                    </Label>
                  </div>
                )}

                {/* Photo Upload Area */}
                {currentTask.requires_image && (
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold">Upload Task Photo *</Label>
                    <div className="border-2 border-dashed border-border rounded-xl p-6 text-center bg-card hover:border-primary/50 transition-all">
                      {uploadingTask === currentTask.id ? (
                        <div className="py-4 flex flex-col items-center gap-2">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-xs text-muted-foreground">Analyzing Photo Quality & Object Verification...</p>
                        </div>
                      ) : taskStates[currentTask.id]?.imageUrl ? (
                        <div className="space-y-3">
                          <div className="relative max-w-sm mx-auto rounded-lg overflow-hidden border border-border aspect-video">
                            <img
                              src={taskStates[currentTask.id].imageUrl}
                              alt="Task photo"
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* AI Score & Verdict Feedback Box */}
                          {taskStates[currentTask.id]?.aiConfidence !== undefined && (
                            <div className={`p-3 rounded-lg border max-w-sm mx-auto text-left space-y-1.5 ${
                              taskStates[currentTask.id]?.aiVerdict === 'rejected'
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600'
                                : 'bg-purple-500/10 border-purple-500/30'
                            }`}>
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span className="flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                                  AI Verification Score
                                </span>
                                <span className={taskStates[currentTask.id]?.aiVerdict === 'rejected' ? 'text-rose-500 font-bold' : 'text-purple-600 dark:text-purple-400 font-bold'}>
                                  {taskStates[currentTask.id].aiConfidence}%
                                </span>
                              </div>
                              <Progress value={taskStates[currentTask.id].aiConfidence} className="h-1.5" />

                              {taskStates[currentTask.id]?.rejectReasons && taskStates[currentTask.id].rejectReasons.length > 0 && (
                                <div className="p-2 rounded bg-rose-500/15 text-[11px] text-rose-600 dark:text-rose-400 space-y-0.5 mt-1 font-medium">
                                  <p className="font-bold">❌ AI Rejection Reasons:</p>
                                  {taskStates[currentTask.id].rejectReasons.map((r: string, idx: number) => (
                                    <p key={idx}>• {r}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && handleImageCapture(currentTask.id, e.target.files[0])}
                            />
                            <Button type="button" variant="outline" size="sm" className="text-xs">
                              Retake / Replace Photo
                            </Button>
                          </label>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center gap-2">
                          <Camera className="w-8 h-8 text-primary" />
                          <span className="text-xs font-semibold text-foreground">Take or Upload Task Photo</span>
                          <span className="text-[10px] text-muted-foreground">PNG, JPG, WEBP (Auto-compressed with GPS tag)</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleImageCapture(currentTask.id, e.target.files[0])}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {/* Task Navigation Controls */}
                <div className="flex justify-between items-center pt-4 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentTaskIndex === 0}
                    onClick={() => setCurrentTaskIndex((prev) => prev - 1)}
                  >
                    Previous Task
                  </Button>

                  {currentTaskIndex < tasks.length - 1 ? (
                    <Button size="sm" onClick={() => setCurrentTaskIndex((prev) => prev + 1)}>
                      Next Task
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleCompleteChecklist} disabled={submitting} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="w-4 h-4" />
                      Submit Completed Checklist
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default StaffChecklistExecutionPage;
