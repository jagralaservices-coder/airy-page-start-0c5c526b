-- Migration to ensure all checklist columns exist in Supabase database
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS repeat_type TEXT DEFAULT 'daily';
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS due_time TIME;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'general';
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS auto_approve_threshold NUMERIC DEFAULT 85;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
