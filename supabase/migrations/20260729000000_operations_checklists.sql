-- Operations Checklist Module Migration

-- 1. Checklists Table
CREATE TABLE IF NOT EXISTS public.checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    department TEXT,
    type TEXT NOT NULL, -- opening, closing, cleaning, inventory, kitchen, cash_counter, delivery, custom
    priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    due_date DATE,
    due_time TIME,
    repeat_type TEXT NOT NULL DEFAULT 'none', -- none, daily, weekly, monthly
    status TEXT NOT NULL DEFAULT 'draft', -- draft, active, completed, expired, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id)
);

-- 2. Checklist Assignments
CREATE TABLE IF NOT EXISTS public.checklist_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    role TEXT,
    department TEXT,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Checklist Items
CREATE TABLE IF NOT EXISTS public.checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    is_required BOOLEAN DEFAULT true,
    requires_image BOOLEAN DEFAULT false,
    min_image_count INTEGER DEFAULT 0,
    max_image_count INTEGER DEFAULT 1,
    sample_images JSONB DEFAULT '[]'::jsonb,
    video_reference TEXT,
    requires_gps BOOLEAN DEFAULT false,
    requires_timestamp BOOLEAN DEFAULT false,
    requires_remarks BOOLEAN DEFAULT false,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Checklist Submissions (Staff taking a checklist)
CREATE TABLE IF NOT EXISTS public.checklist_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, in_review, approved, rejected
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    overall_score NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Checklist Item Responses
CREATE TABLE IF NOT EXISTS public.checklist_item_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.checklist_submissions(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, rejected, needs_reupload
    uploaded_images JSONB DEFAULT '[]'::jsonb,
    remarks TEXT,
    gps_location JSONB,
    timestamp TIMESTAMP WITH TIME ZONE,
    ai_confidence_score NUMERIC,
    ai_reason TEXT,
    reviewer_comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_item_responses ENABLE ROW LEVEL SECURITY;

-- Owner/Admin full access based on merchant_id
CREATE POLICY "Enable all for owners on checklists" ON public.checklists
    FOR ALL USING (merchant_id IN (
        SELECT id FROM public.merchants WHERE owner_id = auth.uid() OR id IN (
            SELECT merchant_id FROM public.staff WHERE user_id = auth.uid() AND (role = 'admin' OR role = 'store_manager')
        )
    ));

-- Items are accessible if checklist is accessible
CREATE POLICY "Enable all for owners on checklist_items" ON public.checklist_items
    FOR ALL USING (checklist_id IN (
        SELECT id FROM public.checklists WHERE merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid() OR id IN (
                SELECT merchant_id FROM public.staff WHERE user_id = auth.uid() AND (role = 'admin' OR role = 'store_manager')
            )
        )
    ));

CREATE POLICY "Enable all for owners on checklist_assignments" ON public.checklist_assignments
    FOR ALL USING (checklist_id IN (
        SELECT id FROM public.checklists WHERE merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid() OR id IN (
                SELECT merchant_id FROM public.staff WHERE user_id = auth.uid() AND (role = 'admin' OR role = 'store_manager')
            )
        )
    ));

CREATE POLICY "Enable all for owners on checklist_submissions" ON public.checklist_submissions
    FOR ALL USING (checklist_id IN (
        SELECT id FROM public.checklists WHERE merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_id = auth.uid() OR id IN (
                SELECT merchant_id FROM public.staff WHERE user_id = auth.uid() AND (role = 'admin' OR role = 'store_manager')
            )
        )
    ));

CREATE POLICY "Enable all for owners on checklist_item_responses" ON public.checklist_item_responses
    FOR ALL USING (submission_id IN (
        SELECT id FROM public.checklist_submissions WHERE checklist_id IN (
            SELECT id FROM public.checklists WHERE merchant_id IN (
                SELECT id FROM public.merchants WHERE owner_id = auth.uid() OR id IN (
                    SELECT merchant_id FROM public.staff WHERE user_id = auth.uid() AND (role = 'admin' OR role = 'store_manager')
                )
            )
        )
    ));

-- Simple Staff access policies (Staff can select checklists they are assigned to, and manage submissions)
CREATE POLICY "Staff can view assigned checklists" ON public.checklists
    FOR SELECT USING (
        id IN (
            SELECT checklist_id FROM public.checklist_assignments WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Staff can view items" ON public.checklist_items
    FOR SELECT USING (
        checklist_id IN (
            SELECT checklist_id FROM public.checklist_assignments WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Staff can manage their submissions" ON public.checklist_submissions
    FOR ALL USING (
        staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
    );

CREATE POLICY "Staff can manage their responses" ON public.checklist_item_responses
    FOR ALL USING (
        submission_id IN (
            SELECT id FROM public.checklist_submissions WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            )
        )
    );
