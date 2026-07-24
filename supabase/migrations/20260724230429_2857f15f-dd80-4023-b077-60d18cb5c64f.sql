ALTER TYPE public.checklist_input_type ADD VALUE IF NOT EXISTS 'text';
ALTER TYPE public.checklist_input_type ADD VALUE IF NOT EXISTS 'number';
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS category text;