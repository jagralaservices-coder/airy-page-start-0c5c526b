
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.checklist_frequency AS ENUM ('daily','weekly','monthly','before_shift','after_shift','custom','once');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.checklist_answer_type AS ENUM ('yes_no','text','number','photo','multi_photo','signature','video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.checklist_submission_status AS ENUM ('pending','ai_pass','ai_fail','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.uniform_ref_kind AS ENUM ('front','back','side','cap','apron','shoes','gloves','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ Helper: is merchant/owner/admin/super_admin ============
CREATE OR REPLACE FUNCTION public.is_owner_or_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user
      AND role IN ('super_admin','admin','owner','merchant','store_manager')
      AND COALESCE(is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_merchant_ids(_user uuid)
RETURNS TABLE(merchant_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT customer_id FROM public.user_roles
  WHERE user_id = _user AND customer_id IS NOT NULL
  UNION
  SELECT DISTINCT id FROM public.customers WHERE owner_user_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.user_role_names(_user uuid)
RETURNS TABLE(role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.user_roles
  WHERE user_id = _user AND COALESCE(is_active, true) = true;
$$;

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.chk_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ checklists ============
CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid NULL,
  name text NOT NULL,
  description text,
  department text,
  frequency public.checklist_frequency NOT NULL DEFAULT 'daily',
  custom_cron text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklists_owner_all" ON public.checklists FOR ALL TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid()))
  WITH CHECK (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid()));
CREATE POLICY "checklists_staff_read" ON public.checklists FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())));
CREATE TRIGGER trg_checklists_updated BEFORE UPDATE ON public.checklists FOR EACH ROW EXECUTE FUNCTION public.chk_touch_updated_at();

-- ============ checklist_items ============
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  answer_type public.checklist_answer_type NOT NULL DEFAULT 'yes_no',
  required boolean NOT NULL DEFAULT true,
  photo_required boolean NOT NULL DEFAULT false,
  video_required boolean NOT NULL DEFAULT false,
  gps_required boolean NOT NULL DEFAULT false,
  time_required boolean NOT NULL DEFAULT false,
  ai_verify boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chk_items_owner_all" ON public.checklist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())));
CREATE POLICY "chk_items_read" ON public.checklist_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid()))));
CREATE INDEX idx_chk_items_checklist ON public.checklist_items(checklist_id, order_index);
CREATE TRIGGER trg_chk_items_updated BEFORE UPDATE ON public.checklist_items FOR EACH ROW EXECUTE FUNCTION public.chk_touch_updated_at();

-- ============ checklist_assignments ============
CREATE TABLE public.checklist_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  assigned_role text,
  assigned_user_id uuid,
  store_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_assignments TO authenticated;
GRANT ALL ON public.checklist_assignments TO service_role;
ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chk_assign_owner_all" ON public.checklist_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())));
CREATE POLICY "chk_assign_staff_read" ON public.checklist_assignments FOR SELECT TO authenticated
  USING (
    is_active
    AND (assigned_user_id = auth.uid() OR assigned_role IN (SELECT role FROM public.user_role_names(auth.uid())))
  );
CREATE INDEX idx_chk_assign_checklist ON public.checklist_assignments(checklist_id);
CREATE INDEX idx_chk_assign_user ON public.checklist_assignments(assigned_user_id) WHERE assigned_user_id IS NOT NULL;
CREATE TRIGGER trg_chk_assign_updated BEFORE UPDATE ON public.checklist_assignments FOR EACH ROW EXECUTE FUNCTION public.chk_touch_updated_at();

-- ============ checklist_submissions ============
CREATE TABLE public.checklist_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL,
  store_id uuid,
  staff_user_id uuid NOT NULL,
  staff_name text,
  shift text,
  status public.checklist_submission_status NOT NULL DEFAULT 'pending',
  overall_score numeric,
  gps_lat numeric,
  gps_lng numeric,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_submissions TO authenticated;
GRANT ALL ON public.checklist_submissions TO service_role;
ALTER TABLE public.checklist_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chk_sub_owner_all" ON public.checklist_submissions FOR ALL TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid()))
  WITH CHECK (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid()));
CREATE POLICY "chk_sub_staff_read_own" ON public.checklist_submissions FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid());
CREATE POLICY "chk_sub_staff_insert_own" ON public.checklist_submissions FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid());
CREATE INDEX idx_chk_sub_merchant_date ON public.checklist_submissions(merchant_id, submitted_at DESC);
CREATE INDEX idx_chk_sub_staff ON public.checklist_submissions(staff_user_id, submitted_at DESC);
CREATE TRIGGER trg_chk_sub_updated BEFORE UPDATE ON public.checklist_submissions FOR EACH ROW EXECUTE FUNCTION public.chk_touch_updated_at();

-- ============ submission_answers ============
CREATE TABLE public.submission_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.checklist_submissions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  answer_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_answers TO authenticated;
GRANT ALL ON public.submission_answers TO service_role;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_owner_all" ON public.submission_answers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())));
CREATE POLICY "sa_staff_own" ON public.submission_answers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.staff_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.staff_user_id = auth.uid()));

-- ============ submission_images ============
CREATE TABLE public.submission_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.checklist_submissions(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'item_photo',
  storage_path text NOT NULL,
  thumb_path text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  gps_lat numeric,
  gps_lng numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_images TO authenticated;
GRANT ALL ON public.submission_images TO service_role;
ALTER TABLE public.submission_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_owner_all" ON public.submission_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())));
CREATE POLICY "si_staff_own" ON public.submission_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.staff_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.staff_user_id = auth.uid()));

-- ============ uniform_reference_images ============
CREATE TABLE public.uniform_reference_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  kind public.uniform_ref_kind NOT NULL,
  storage_path text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_reference_images TO authenticated;
GRANT ALL ON public.uniform_reference_images TO service_role;
ALTER TABLE public.uniform_reference_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uri_owner_all" ON public.uniform_reference_images FOR ALL TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid()))
  WITH CHECK (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid()));
CREATE POLICY "uri_merchant_read" ON public.uniform_reference_images FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())));
CREATE INDEX idx_uri_merchant ON public.uniform_reference_images(merchant_id, kind, is_current);
CREATE TRIGGER trg_uri_updated BEFORE UPDATE ON public.uniform_reference_images FOR EACH ROW EXECUTE FUNCTION public.chk_touch_updated_at();

-- ============ ai_verification_results ============
CREATE TABLE public.ai_verification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.checklist_submissions(id) ON DELETE CASCADE,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_score numeric,
  result text NOT NULL DEFAULT 'pending',
  reason text,
  raw_response jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_verification_results TO authenticated;
GRANT ALL ON public.ai_verification_results TO service_role;
ALTER TABLE public.ai_verification_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avr_owner_all" ON public.ai_verification_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())));
CREATE POLICY "avr_staff_read_own" ON public.ai_verification_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.staff_user_id = auth.uid()));

-- ============ owner_reviews ============
CREATE TABLE public.owner_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.checklist_submissions(id) ON DELETE CASCADE,
  reviewer_id uuid,
  decision text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_reviews TO authenticated;
GRANT ALL ON public.owner_reviews TO service_role;
ALTER TABLE public.owner_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "or_owner_all" ON public.owner_reviews FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid())));
CREATE POLICY "or_staff_read_own" ON public.owner_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_submissions s WHERE s.id = submission_id AND s.staff_user_id = auth.uid()));

-- ============ checklist_notifications ============
CREATE TABLE public.checklist_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  merchant_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_notifications TO authenticated;
GRANT ALL ON public.checklist_notifications TO service_role;
ALTER TABLE public.checklist_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cn_own" ON public.checklist_notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_cn_user ON public.checklist_notifications(user_id, created_at DESC);

-- ============ checklist_templates (shared catalog) ============
CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  suggested_answer_type public.checklist_answer_type NOT NULL DEFAULT 'yes_no',
  photo_required boolean NOT NULL DEFAULT false,
  ai_verify boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_read_all" ON public.checklist_templates FOR SELECT TO authenticated USING (true);

INSERT INTO public.checklist_templates (title, category, suggested_answer_type, photo_required, ai_verify) VALUES
  ('Uniform', 'grooming', 'photo', true, true),
  ('Hair', 'grooming', 'photo', true, true),
  ('Nails', 'grooming', 'photo', true, true),
  ('Shoes', 'grooming', 'photo', true, true),
  ('Cap', 'grooming', 'photo', true, true),
  ('Mask', 'grooming', 'photo', true, true),
  ('Gloves', 'grooming', 'photo', true, true),
  ('Apron', 'grooming', 'photo', true, true),
  ('ID Card', 'grooming', 'photo', true, true),
  ('Face Clean', 'grooming', 'photo', true, true),
  ('Counter Clean', 'cleaning', 'photo', true, false),
  ('Kitchen Clean', 'cleaning', 'photo', true, false),
  ('Temperature Check', 'safety', 'number', false, false),
  ('Hand Wash', 'safety', 'yes_no', false, false),
  ('Cash Drawer', 'operations', 'yes_no', false, false),
  ('Machine Check', 'operations', 'yes_no', false, false),
  ('Closing Cleaning', 'cleaning', 'photo', true, false),
  ('Opening Cleaning', 'cleaning', 'photo', true, false),
  ('Food Quality', 'quality', 'yes_no', true, false),
  ('Expiry Check', 'quality', 'yes_no', false, false);

-- ============ checklist_activity_logs ============
CREATE TABLE public.checklist_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.checklist_activity_logs TO authenticated;
GRANT ALL ON public.checklist_activity_logs TO service_role;
ALTER TABLE public.checklist_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cal_owner_read" ON public.checklist_activity_logs FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid())) AND public.is_owner_or_admin(auth.uid()));
CREATE POLICY "cal_insert_authenticated" ON public.checklist_activity_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
CREATE INDEX idx_cal_merchant ON public.checklist_activity_logs(merchant_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_verification_results;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_notifications;
