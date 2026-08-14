-- Complete Checklist Module Migration & Schema Overhaul
-- Version: 20260730000000

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Checklists Table
CREATE TABLE IF NOT EXISTS public.checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    department TEXT DEFAULT 'operations',
    type TEXT NOT NULL DEFAULT 'opening', -- opening, closing, cleaning, inventory, kitchen, cash_counter, delivery, custom
    priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    due_date DATE,
    due_time TIME,
    repeat_type TEXT NOT NULL DEFAULT 'none', -- none, daily, weekly, monthly
    status TEXT NOT NULL DEFAULT 'draft', -- draft, active, completed, expired, cancelled
    is_published BOOLEAN DEFAULT false,
    auto_approve_threshold NUMERIC DEFAULT 85,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 2. Checklist Tasks (Tasks within a checklist)
CREATE TABLE IF NOT EXISTS public.checklist_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    is_required BOOLEAN DEFAULT true,
    requires_image BOOLEAN DEFAULT false,
    min_image_count INTEGER DEFAULT 0,
    max_image_count INTEGER DEFAULT 1,
    requires_gps BOOLEAN DEFAULT false,
    requires_timestamp BOOLEAN DEFAULT false,
    requires_remarks BOOLEAN DEFAULT false,
    ai_verification_enabled BOOLEAN DEFAULT true,
    pass_score NUMERIC DEFAULT 85,
    weightage NUMERIC DEFAULT 1.0,
    sample_images JSONB DEFAULT '[]'::jsonb, -- Array of image URLs
    video_reference TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Backward compatibility view/alias if referenced
CREATE OR REPLACE VIEW public.checklist_items AS SELECT * FROM public.checklist_tasks;

-- 3. Checklist Assignments
CREATE TABLE IF NOT EXISTS public.checklist_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_role TEXT,
    assigned_department TEXT,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Checklist Results (Staff Submissions)
CREATE TABLE IF NOT EXISTS public.checklist_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, pending_review, approved, rejected, reupload_requested
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    overall_score NUMERIC DEFAULT 0,
    completed_tasks_count INTEGER DEFAULT 0,
    total_tasks_count INTEGER DEFAULT 0,
    reviewer_notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Checklist Images
CREATE TABLE IF NOT EXISTS public.checklist_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID REFERENCES public.checklist_results(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.checklist_tasks(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    compressed_url TEXT,
    thumbnail_url TEXT,
    image_hash TEXT,
    gps_coordinates JSONB,
    device_info JSONB,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Checklist Verifications (AI Analysis Results per task)
CREATE TABLE IF NOT EXISTS public.checklist_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES public.checklist_results(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.checklist_tasks(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, approved, rejected, needs_reupload
    uploaded_images JSONB DEFAULT '[]'::jsonb,
    remarks TEXT,
    gps_location JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    ai_confidence_score NUMERIC DEFAULT 0,
    ai_verdict TEXT, -- auto_approved, review_required, rejected
    ai_metrics JSONB DEFAULT '{}'::jsonb, -- { object: 98, cleanliness: 95, placement: 92, lighting: 90 }
    reject_reasons JSONB DEFAULT '[]'::jsonb, -- ['blurry', 'dark', 'wrong_object']
    reviewer_comments TEXT,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Checklist Notifications
CREATE TABLE IF NOT EXISTS public.checklist_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- assigned, completed, failed, ai_review_required, reupload_requested, overdue
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    checklist_id UUID REFERENCES public.checklists(id) ON DELETE CASCADE,
    result_id UUID REFERENCES public.checklist_results(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Checklist Logs
CREATE TABLE IF NOT EXISTS public.checklist_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    checklist_id UUID REFERENCES public.checklists(id) ON DELETE CASCADE,
    result_id UUID REFERENCES public.checklist_results(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- created, updated, published, assigned, started, task_submitted, ai_evaluated, approved, rejected, reupload_requested
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_checklists_merchant ON public.checklists(merchant_id);
CREATE INDEX IF NOT EXISTS idx_checklists_store ON public.checklists(store_id);
CREATE INDEX IF NOT EXISTS idx_checklist_tasks_checklist ON public.checklist_tasks(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_assignments_staff ON public.checklist_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_checklist_results_checklist ON public.checklist_results(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_verifications_result ON public.checklist_verifications(result_id);

-- RLS POLICIES FOR MULTI-TENANT ISOLATION
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_logs ENABLE ROW LEVEL SECURITY;

-- Helper policy logic: User is owner/admin of merchant OR assigned staff
CREATE POLICY "Merchant owner full access checklists" ON public.checklists
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'super_admin', 'store_manager')
        )
        OR id IN (
            SELECT checklist_id FROM public.checklist_assignments WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            ) OR user_id = auth.uid()
        )
    );

CREATE POLICY "Merchant owner full access tasks" ON public.checklist_tasks
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'super_admin', 'store_manager')
        )
        OR checklist_id IN (
            SELECT id FROM public.checklists WHERE id IN (
                SELECT checklist_id FROM public.checklist_assignments WHERE staff_id IN (
                    SELECT id FROM public.staff WHERE user_id = auth.uid()
                ) OR user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Access control checklist_assignments" ON public.checklist_assignments
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    );

CREATE POLICY "Access control checklist_results" ON public.checklist_results
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    );

CREATE POLICY "Access control checklist_verifications" ON public.checklist_verifications
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR result_id IN (
            SELECT id FROM public.checklist_results WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            ) OR user_id = auth.uid()
        )
    );

CREATE POLICY "Access control checklist_images" ON public.checklist_images
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR result_id IN (
            SELECT id FROM public.checklist_results WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            ) OR user_id = auth.uid()
        )
    );

CREATE POLICY "Access control checklist_notifications" ON public.checklist_notifications
    FOR ALL USING (
        user_id = auth.uid() OR merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "Access control checklist_logs" ON public.checklist_logs
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
    );

-- Storage bucket creation for checklist images
INSERT INTO storage.buckets (id, name, public)
VALUES ('checklist-images', 'checklist-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for checklist images
CREATE POLICY "Public read checklist images" ON storage.objects
    FOR SELECT USING (bucket_id = 'checklist-images');

CREATE POLICY "Authenticated insert checklist images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'checklist-images' AND auth.role() = 'authenticated');
