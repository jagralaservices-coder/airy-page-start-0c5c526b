
-- Extend status enum with review_required
ALTER TYPE public.checklist_submission_status ADD VALUE IF NOT EXISTS 'review_required';

-- New columns on submissions
ALTER TABLE public.checklist_submissions
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reupload_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reupload_item_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reupload_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS reupload_requested_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS parent_submission_id uuid;

-- New column on checklists
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS ai_confidence_threshold integer NOT NULL DEFAULT 75;

-- owner_reviews.decision: allow request_reupload
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.owner_reviews'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%decision%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.owner_reviews DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.owner_reviews
  ADD CONSTRAINT owner_reviews_decision_check
  CHECK (decision IN ('approved','rejected','request_reupload'));

-- Auto-lock trigger
CREATE OR REPLACE FUNCTION public.checklist_submission_auto_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reupload requested → unlock and clear approval
  IF NEW.reupload_item_ids IS NOT NULL
     AND array_length(NEW.reupload_item_ids, 1) IS NOT NULL
     AND (OLD.reupload_item_ids IS NULL
          OR array_length(OLD.reupload_item_ids, 1) IS NULL
          OR NEW.reupload_item_ids <> OLD.reupload_item_ids) THEN
    NEW.locked := false;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  -- Approval/AI pass → lock
  IF NEW.status IN ('approved','ai_pass','rejected')
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.locked = false) THEN
    IF array_length(COALESCE(NEW.reupload_item_ids, '{}'::uuid[]), 1) IS NULL THEN
      NEW.locked := true;
      IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN
        NEW.approved_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checklist_submission_auto_lock ON public.checklist_submissions;
CREATE TRIGGER trg_checklist_submission_auto_lock
BEFORE UPDATE ON public.checklist_submissions
FOR EACH ROW EXECUTE FUNCTION public.checklist_submission_auto_lock();

-- Prevent staff from editing answers/images on locked submissions
CREATE OR REPLACE FUNCTION public.checklist_submission_is_unlocked(_sub_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NOT locked, true) FROM public.checklist_submissions WHERE id = _sub_id;
$$;

-- Refresh staff RLS policies for locking
DROP POLICY IF EXISTS "staff_write_own_unlocked_submission" ON public.checklist_submissions;
CREATE POLICY "staff_write_own_unlocked_submission"
  ON public.checklist_submissions
  FOR UPDATE
  TO authenticated
  USING (staff_user_id = auth.uid() AND locked = false)
  WITH CHECK (staff_user_id = auth.uid());

DROP POLICY IF EXISTS "staff_write_answers_unlocked" ON public.submission_answers;
CREATE POLICY "staff_write_answers_unlocked"
  ON public.submission_answers
  FOR ALL
  TO authenticated
  USING (public.checklist_submission_is_unlocked(submission_id))
  WITH CHECK (public.checklist_submission_is_unlocked(submission_id));

DROP POLICY IF EXISTS "staff_write_images_unlocked" ON public.submission_images;
CREATE POLICY "staff_write_images_unlocked"
  ON public.submission_images
  FOR ALL
  TO authenticated
  USING (public.checklist_submission_is_unlocked(submission_id))
  WITH CHECK (public.checklist_submission_is_unlocked(submission_id));
