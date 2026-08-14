-- 1. Update handle_new_user trigger to support metadata role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  meta_role text;
  assigned_role text;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    -- Get role from metadata if specified
    meta_role := NEW.raw_user_meta_data->>'role';
    
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
      assigned_role := 'super_admin';
    ELSIF meta_role IS NOT NULL AND meta_role IN ('owner', 'admin', 'store_manager', 'staff', 'cashier') THEN
      assigned_role := meta_role;
    ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
      assigned_role := 'owner';
    ELSE
      assigned_role := 'cashier';
    END IF;

    INSERT INTO public.user_roles (user_id, role, is_active) 
    VALUES (NEW.id, assigned_role::public.user_role, true);
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Redefine can_manage_store to support cross-matching of customer_id and merchant_id
CREATE OR REPLACE FUNCTION public.can_manage_store(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.stores s ON s.id = _store_id
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND (
        ur.role IN ('super_admin', 'admin')
        OR s.owner_id = auth.uid()
        OR (
          ur.role IN ('owner', 'merchant', 'manager')
          AND (
            (ur.merchant_id IS NOT NULL AND ur.merchant_id = s.merchant_id)
            OR (ur.customer_id IS NOT NULL AND ur.customer_id = s.customer_id)
            OR (ur.merchant_id IS NOT NULL AND ur.merchant_id = s.customer_id)
            OR (ur.customer_id IS NOT NULL AND ur.customer_id = s.merchant_id)
          )
        )
        OR (ur.role IN ('store_manager', 'staff', 'cashier') AND ur.store_id = _store_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store(uuid) TO authenticated, service_role;

-- 3. Fix checklists RLS policies (replace owner_id with owner_user_id on public.merchants)
DROP POLICY IF EXISTS "Merchant owner full access checklists" ON public.checklists;
CREATE POLICY "Merchant owner full access checklists" ON public.checklists
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'super_admin', 'store_manager')
        )
        OR id IN (
            SELECT checklist_id FROM public.checklist_assignments WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            ) OR user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Merchant owner full access tasks" ON public.checklist_tasks;
CREATE POLICY "Merchant owner full access tasks" ON public.checklist_tasks
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
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

DROP POLICY IF EXISTS "Access control checklist_assignments" ON public.checklist_assignments;
CREATE POLICY "Access control checklist_assignments" ON public.checklist_assignments
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Access control checklist_results" ON public.checklist_results;
CREATE POLICY "Access control checklist_results" ON public.checklist_results
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Access control checklist_verifications" ON public.checklist_verifications;
CREATE POLICY "Access control checklist_verifications" ON public.checklist_verifications
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR result_id IN (
            SELECT id FROM public.checklist_results WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            ) OR user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Access control checklist_images" ON public.checklist_images;
CREATE POLICY "Access control checklist_images" ON public.checklist_images
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
        OR result_id IN (
            SELECT id FROM public.checklist_results WHERE staff_id IN (
                SELECT id FROM public.staff WHERE user_id = auth.uid()
            ) OR user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Access control checklist_notifications" ON public.checklist_notifications;
CREATE POLICY "Access control checklist_notifications" ON public.checklist_notifications
    FOR ALL USING (
        user_id = auth.uid() OR merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Access control checklist_logs" ON public.checklist_logs;
CREATE POLICY "Access control checklist_logs" ON public.checklist_logs
    FOR ALL USING (
        merchant_id IN (
            SELECT id FROM public.merchants WHERE owner_user_id = auth.uid()
            UNION
            SELECT merchant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
    );
