import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { usePOS } from '@/contexts/POSContext';
import { resolveMerchantContext } from '@/lib/checklists/merchantResolver';
import { SampleImageUploader } from '@/components/checklists/SampleImageUploader';
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  Building2,
  FileText,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';

export const ChecklistCreatePage: React.FC = () => {
  const { user, userRole } = useSupabaseAuth();
  const { activeStore } = usePOS();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Single Merged Checklist State
  const [checklist, setChecklist] = useState({
    title: '',
    description: '',
    category: 'operations',
    priority: 'medium',
    department: 'general',
    type: 'opening',
    repeat_type: 'daily',
    due_time: '09:00',
    assigned_role: 'staff',
    auto_approve_threshold: 85,
    is_required: true,
    requires_image: true,
    min_image_count: 1,
    max_image_count: 3,
    requires_gps: true,
    requires_timestamp: true,
    requires_remarks: false,
    ai_verification_enabled: true,
    sample_images: [] as string[],
    verification_type: 'image_and_tick',
  });

  /**
   * Ultra-robust adaptive schema insert helper.
   * Handles 'name' vs 'title' column schemas, missing columns, and PostgREST schema cache errors.
   */
  const safeInsertChecklistRecord = async (fullPayload: Record<string, any>) => {
    const titleVal = fullPayload.title || fullPayload.name || 'Untitled Checklist';
    let currentPayload = {
      ...fullPayload,
      name: titleVal,
      title: titleVal,
    };

    const maxAttempts = 12;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data, error } = await supabase
        .from('checklists')
        .insert(currentPayload)
        .select()
        .single();

      if (!error && data) {
        return data;
      }

      // Handle missing PostgREST column
      const match = error?.message?.match(/Could not find the '([^']+)' column/i);
      if (match && match[1]) {
        const missingCol = match[1];
        console.warn(`PostgREST schema missing column '${missingCol}', stripping and retrying...`);
        delete currentPayload[missingCol];
      } else {
        // Fallback: core payload providing both name and title
        console.warn('PostgREST insert fallback:', error?.message);
        const minimalPayload: Record<string, any> = {
          merchant_id: fullPayload.merchant_id,
          store_id: fullPayload.store_id || null,
          name: titleVal,
          title: titleVal,
          description: fullPayload.description || null,
          category: fullPayload.category || 'operations',
          type: fullPayload.type || 'opening',
          status: fullPayload.status || 'draft',
          created_by: fullPayload.created_by || null,
        };

        const { data: minData, error: minErr } = await supabase
          .from('checklists')
          .insert(minimalPayload)
          .select()
          .single();

        if (!minErr && minData) return minData;

        // Try without 'title' if schema uses 'name' exclusively
        delete minimalPayload.title;
        const { data: minData2, error: minErr2 } = await supabase
          .from('checklists')
          .insert(minimalPayload)
          .select()
          .single();

        if (!minErr2 && minData2) return minData2;

        // Try without 'name' if schema uses 'title' exclusively
        delete minimalPayload.name;
        minimalPayload.title = titleVal;
        const { data: minData3, error: minErr3 } = await supabase
          .from('checklists')
          .insert(minimalPayload)
          .select()
          .single();

        if (!minErr3 && minData3) return minData3;

        throw minErr3 || minErr2 || minErr;
      }
    }

    throw new Error('Checklist save failed after adaptive schema attempts.');
  };

  const handleSaveChecklist = async (status: 'draft' | 'active') => {
    if (!checklist.title.trim()) {
      toast({ title: 'Validation Error', description: 'Checklist name is required.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const merchantCtx = await resolveMerchantContext(user, activeStore, userRole);

      const titleText = checklist.title.trim();
      const fullPayload: Record<string, any> = {
        merchant_id: merchantCtx.merchantId,
        store_id: merchantCtx.storeId,
        name: titleText,
        title: titleText,
        description: checklist.description.trim() || null,
        category: checklist.category,
        type: checklist.type,
        priority: checklist.priority,
        repeat_type: checklist.repeat_type,
        due_time: checklist.due_time || null,
        department: checklist.department || null,
        auto_approve_threshold: checklist.auto_approve_threshold,
        is_published: status === 'active',
        status,
        created_by: user?.id,
        verification_type: checklist.verification_type || 'image_and_tick',
      };

      // 1. Safe adaptive insert into checklists table
      const clData = await safeInsertChecklistRecord(fullPayload);

      // 2. Insert item into checklist_items
      const itemPayload: Record<string, any> = {
        checklist_id: clData.id,
        task_name: titleText,
        name: titleText,
        title: titleText,
        instructions: checklist.description.trim() || null,
        description: checklist.description.trim() || null,
        is_required: checklist.is_required,
        requires_image: checklist.requires_image,
        min_image_count: checklist.min_image_count,
        max_image_count: checklist.max_image_count,
        requires_gps: checklist.requires_gps,
        requires_timestamp: checklist.requires_timestamp,
        requires_remarks: checklist.requires_remarks,
        sample_images: checklist.sample_images || [],
        order_index: 0,
      };

      const { error: itemsErr } = await supabase.from('checklist_items').insert([itemPayload]);
      if (itemsErr) {
        // Strip extra columns if checklist_items schema varies
        delete itemPayload.name;
        delete itemPayload.title;
        delete itemPayload.description;
        delete itemPayload.verification_type;
        await supabase.from('checklist_items').insert([itemPayload]);
      }

      // 3. Save Assignment
      await supabase.from('checklist_assignments').insert({
        checklist_id: clData.id,
        role: checklist.assigned_role,
        department: checklist.department,
        store_id: merchantCtx.storeId,
      });

      toast({
        title: status === 'active' ? 'Checklist Published' : 'Draft Saved Successfully',
        description: `Checklist "${titleText}" has been saved successfully.`,
      });

      navigate('/operations/checklists');
    } catch (err: any) {
      console.error('Checklist save error:', err);
      toast({
        title: 'Failed to Save Checklist',
        description: err.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto pb-24">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/operations/checklists')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Create Checklist</h1>
            <p className="text-xs text-muted-foreground">Configure store checklist rules, benchmark reference photos & verification</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" onClick={() => handleSaveChecklist('draft')} disabled={saving}>
            Save Draft
          </Button>
          <Button onClick={() => handleSaveChecklist('active')} disabled={saving} className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Publish Checklist
          </Button>
        </div>
      </div>

      {/* SINGLE UNIFIED CHECKLIST FORM */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4 border-b border-border/50">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Checklist Configuration & Rules
          </CardTitle>
          <CardDescription className="text-xs">
            Define checklist scope, reference photos, schedule, and validation rules
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* 1. Basic Details */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Checklist Name *</Label>
              <Input
                placeholder="e.g. Morning Kitchen Cleaning & Hygiene Inspection"
                value={checklist.title}
                onChange={(e) => setChecklist({ ...checklist, title: e.target.value })}
                className="font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Instructions & Scope</Label>
              <Textarea
                placeholder="Detailed instructions for staff on how to complete this checklist..."
                rows={3}
                value={checklist.description}
                onChange={(e) => setChecklist({ ...checklist, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Category</Label>
                <Select value={checklist.category} onValueChange={(val) => setChecklist({ ...checklist, category: val })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operations">Operations</SelectItem>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                    <SelectItem value="cleaning">Cleaning & Hygiene</SelectItem>
                    <SelectItem value="inventory">Inventory</SelectItem>
                    <SelectItem value="cash_counter">Cash Counter</SelectItem>
                    <SelectItem value="opening">Opening</SelectItem>
                    <SelectItem value="closing">Closing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Priority</Label>
                <Select value={checklist.priority} onValueChange={(val) => setChecklist({ ...checklist, priority: val })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low Priority</SelectItem>
                    <SelectItem value="medium">Medium Priority</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="critical">Critical Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Repeat Schedule</Label>
                <Select value={checklist.repeat_type} onValueChange={(val) => setChecklist({ ...checklist, repeat_type: val })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Repeat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time Only</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Due Time</Label>
                <Input
                  type="time"
                  className="h-9 text-xs"
                  value={checklist.due_time}
                  onChange={(e) => setChecklist({ ...checklist, due_time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Assigned Role</Label>
                <Select value={checklist.assigned_role} onValueChange={(val) => setChecklist({ ...checklist, assigned_role: val })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="store_manager">Store Manager</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="all">All Roles</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Assigned Store</Label>
                <div className="h-9 px-3 border border-border rounded-md bg-muted/40 flex items-center text-xs text-foreground font-medium">
                  <Building2 className="w-3.5 h-3.5 mr-2 text-primary" />
                  {activeStore?.name || 'Active Merchant Store'}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Sample Benchmark Photos */}
          <div className="space-y-2 pt-4 border-t border-border/50">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-primary" />
              Sample Reference Images (Owner Benchmark)
            </Label>
            <p className="text-[11px] text-muted-foreground">Upload sample benchmark images for staff reference and AI photo comparison</p>
            <SampleImageUploader
              images={checklist.sample_images}
              onChange={(imgs) => setChecklist({ ...checklist, sample_images: imgs })}
              maxImages={4}
            />
          </div>

          {/* 3. Validation & Rules */}
          <div className="space-y-4 pt-4 border-t border-border/50">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Validation & Verification Rules
            </h3>

            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs font-semibold">Verification Type</Label>
              <Select
                value={checklist.verification_type || 'image_and_tick'}
                onValueChange={(val) => {
                  let requiresImg = false;
                  let isReq = false;
                  if (val === 'image_and_tick') {
                    requiresImg = true;
                    isReq = true;
                  } else if (val === 'only_image') {
                    requiresImg = true;
                    isReq = false;
                  } else if (val === 'only_tick') {
                    requiresImg = false;
                    isReq = true;
                  } else if (val === 'all_ok') {
                    requiresImg = false;
                    isReq = false;
                  }
                  setChecklist({
                    ...checklist,
                    verification_type: val,
                    requires_image: requiresImg,
                    is_required: isReq
                  });
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select verification type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image_and_tick">📸 Photo Upload & ☑️ Checkbox</SelectItem>
                  <SelectItem value="only_image">📸 Photo Upload Only</SelectItem>
                  <SelectItem value="only_tick">☑️ Checkbox Only</SelectItem>
                  <SelectItem value="all_ok">✅ All OK (No Photo or Checkbox)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                <div>
                  <Label className="text-xs font-semibold cursor-pointer">Required Checklist</Label>
                  <p className="text-[10px] text-muted-foreground">Must be completed before shift end</p>
                </div>
                <Switch
                  checked={checklist.is_required}
                  onCheckedChange={(val) => setChecklist({ ...checklist, is_required: val })}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                <div>
                  <Label className="text-xs font-semibold cursor-pointer">Photo Upload Required</Label>
                  <p className="text-[10px] text-muted-foreground">Staff must capture photo proof</p>
                </div>
                <Switch
                  checked={checklist.requires_image}
                  onCheckedChange={(val) => setChecklist({ ...checklist, requires_image: val })}
                />
              </div>
            </div>

            {checklist.requires_image && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Minimum Photos</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    className="h-8 text-xs"
                    value={checklist.min_image_count}
                    onChange={(e) => setChecklist({ ...checklist, min_image_count: parseInt(e.target.value) || 1 })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Maximum Photos</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    className="h-8 text-xs"
                    value={checklist.max_image_count}
                    onChange={(e) => setChecklist({ ...checklist, max_image_count: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card">
                <Label className="text-[11px] font-medium cursor-pointer flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" /> GPS Tag
                </Label>
                <Switch
                  checked={checklist.requires_gps}
                  onCheckedChange={(val) => setChecklist({ ...checklist, requires_gps: val })}
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card">
                <Label className="text-[11px] font-medium cursor-pointer flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-500" /> Timestamp
                </Label>
                <Switch
                  checked={checklist.requires_timestamp}
                  onCheckedChange={(val) => setChecklist({ ...checklist, requires_timestamp: val })}
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card">
                <Label className="text-[11px] font-medium cursor-pointer flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-emerald-500" /> Comment
                </Label>
                <Switch
                  checked={checklist.requires_remarks}
                  onCheckedChange={(val) => setChecklist({ ...checklist, requires_remarks: val })}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> AI Photo Verification & Auto-Approval
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Compare staff photo against reference benchmark photo</p>
                </div>
                <Switch
                  checked={checklist.ai_verification_enabled}
                  onCheckedChange={(val) => setChecklist({ ...checklist, ai_verification_enabled: val })}
                />
              </div>

              {checklist.ai_verification_enabled && (
                <div className="space-y-2 pt-2 border-t border-purple-500/20">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Auto-Approve Threshold Score</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">{checklist.auto_approve_threshold}%</span>
                  </div>
                  <Slider
                    value={[checklist.auto_approve_threshold]}
                    min={50}
                    max={99}
                    step={1}
                    onValueChange={(val) => setChecklist({ ...checklist, auto_approve_threshold: val[0] })}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Submissions scoring &ge; {checklist.auto_approve_threshold}% confidence auto-approve without manual review.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChecklistCreatePage;
