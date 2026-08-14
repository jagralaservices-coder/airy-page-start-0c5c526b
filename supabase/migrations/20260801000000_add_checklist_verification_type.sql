-- Add verification_type column to checklists and checklist_tasks tables
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS verification_type TEXT DEFAULT 'image_and_tick';
ALTER TABLE public.checklist_tasks ADD COLUMN IF NOT EXISTS verification_type TEXT DEFAULT 'image_and_tick';

-- Recreate view for backward compatibility
CREATE OR REPLACE VIEW public.checklist_items AS SELECT * FROM public.checklist_tasks;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
