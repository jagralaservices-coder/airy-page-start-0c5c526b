-- Migration to add missing columns to checklists table and reload PostgREST schema cache
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS auto_approve_threshold NUMERIC DEFAULT 85;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Notify PostgREST to reload schema cache instantly
NOTIFY pgrst, 'reload schema';
