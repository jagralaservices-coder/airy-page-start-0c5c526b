
-- 1) input_type enum
DO $$ BEGIN
  CREATE TYPE public.checklist_input_type AS ENUM ('tick','image','tick_image');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS input_type public.checklist_input_type NOT NULL DEFAULT 'tick';

-- Best-effort backfill from prior flags
UPDATE public.checklist_items
SET input_type = CASE
  WHEN answer_type IN ('photo','multi_photo') AND required THEN 'image'
  WHEN photo_required AND answer_type = 'yes_no' THEN 'tick_image'
  WHEN answer_type = 'yes_no' THEN 'tick'
  ELSE input_type
END
WHERE input_type = 'tick';

-- 2) Per-item reference images
CREATE TABLE IF NOT EXISTS public.checklist_item_reference_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL,
  storage_path text NOT NULL,
  label text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ci_ref_item ON public.checklist_item_reference_images(item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_item_reference_images TO authenticated;
GRANT ALL ON public.checklist_item_reference_images TO service_role;
ALTER TABLE public.checklist_item_reference_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ci_ref_merchant_read" ON public.checklist_item_reference_images;
CREATE POLICY "ci_ref_merchant_read" ON public.checklist_item_reference_images
FOR SELECT TO authenticated
USING (
  merchant_id IN (SELECT customer_id FROM public.user_roles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "ci_ref_merchant_write" ON public.checklist_item_reference_images;
CREATE POLICY "ci_ref_merchant_write" ON public.checklist_item_reference_images
FOR ALL TO authenticated
USING (
  merchant_id IN (SELECT customer_id FROM public.user_roles WHERE user_id = auth.uid()
                  AND role IN ('owner','merchant','admin','store_manager','super_admin'))
)
WITH CHECK (
  merchant_id IN (SELECT customer_id FROM public.user_roles WHERE user_id = auth.uid()
                  AND role IN ('owner','merchant','admin','store_manager','super_admin'))
);

-- 3) Per-item AI verification results (real comparisons only)
CREATE TABLE IF NOT EXISTS public.ai_item_verification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.checklist_submissions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  status text NOT NULL, -- 'match' | 'no_match' | 'poor_quality' | 'no_reference' | 'error'
  confidence numeric,
  reason text,
  detected_problems jsonb,
  suggestions text,
  model text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_item_sub ON public.ai_item_verification_results(submission_id);

GRANT SELECT, INSERT ON public.ai_item_verification_results TO authenticated;
GRANT ALL ON public.ai_item_verification_results TO service_role;
ALTER TABLE public.ai_item_verification_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_item_read" ON public.ai_item_verification_results;
CREATE POLICY "ai_item_read" ON public.ai_item_verification_results
FOR SELECT TO authenticated
USING (
  submission_id IN (
    SELECT id FROM public.checklist_submissions
    WHERE staff_user_id = auth.uid()
       OR merchant_id IN (SELECT customer_id FROM public.user_roles WHERE user_id = auth.uid())
  )
);
