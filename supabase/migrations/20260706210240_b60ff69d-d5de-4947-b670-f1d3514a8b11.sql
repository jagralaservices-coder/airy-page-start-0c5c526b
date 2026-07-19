DROP TABLE IF EXISTS public.staff_attendance CASCADE;

CREATE TABLE public.staff_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.user_roles(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    organization_id UUID,
    check_in TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    check_out TIMESTAMP WITH TIME ZONE,
    working_minutes INTEGER DEFAULT 0,
    working_hours NUMERIC DEFAULT 0.0,
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT CHECK (status IN ('present', 'absent', 'half_day', 'late', 'checked_in', 'checked_out')),
    verification_type TEXT DEFAULT 'face',
    face_image TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;

CREATE INDEX idx_new_staff_attendance_staff_id ON public.staff_attendance(staff_id);
CREATE INDEX idx_new_staff_attendance_store_id ON public.staff_attendance(store_id);
CREATE INDEX idx_new_staff_attendance_date ON public.staff_attendance(attendance_date);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users" ON public.staff_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.staff_attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.staff_attendance FOR UPDATE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';