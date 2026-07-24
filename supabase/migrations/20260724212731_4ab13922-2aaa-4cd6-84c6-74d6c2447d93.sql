
-- QR ORDERS: remove anon table-wide SELECT
DROP POLICY IF EXISTS "anyone_can_track_qr_orders" ON public.qr_orders;

-- STAFF ATTENDANCE: remove permissive policies
DROP POLICY IF EXISTS "Allow authenticated on staff_attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.staff_attendance;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.staff_attendance;

-- Add store-scoped visibility for managers/owners
CREATE POLICY "staff_attendance_manager_select" ON public.staff_attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_attendance.staff_id
        AND public.can_manage_store(s.store_id)
    )
  );

CREATE POLICY "staff_attendance_manager_update" ON public.staff_attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_attendance.staff_id
        AND public.can_manage_store(s.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_attendance.staff_id
        AND public.can_manage_store(s.store_id)
    )
  );

-- STORE SETTINGS: replace permissive ALL with can_manage_store scope
DROP POLICY IF EXISTS "Allow authenticated on store_settings" ON public.store_settings;
CREATE POLICY "store_settings_manager_access" ON public.store_settings
  FOR ALL TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

-- STAFF-FACES storage: scope by staff record ownership (filename starts with "<staff_id>_")
DROP POLICY IF EXISTS "staff_faces_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "staff_faces_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "staff_faces_update_auth" ON storage.objects;
DROP POLICY IF EXISTS "staff_faces_delete_auth" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_access_staff_face(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH parsed AS (
    SELECT split_part(split_part(_object_name, '/', -1), '_', 1) AS staff_key
  )
  SELECT EXISTS (
    SELECT 1 FROM public.staff s, parsed p
    WHERE (
        s.id::text = p.staff_key
        OR s.user_id::text = p.staff_key
        OR s.profile_id::text = p.staff_key
      )
      AND (
        s.user_id = auth.uid()
        OR s.profile_id = auth.uid()
        OR public.can_manage_store(s.store_id)
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND ur.role IN ('super_admin','admin')
  );
$$;

CREATE POLICY "staff_faces_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-faces' AND public.can_access_staff_face(name));

CREATE POLICY "staff_faces_insert_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-faces' AND public.can_access_staff_face(name));

CREATE POLICY "staff_faces_update_scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'staff-faces' AND public.can_access_staff_face(name))
  WITH CHECK (bucket_id = 'staff-faces' AND public.can_access_staff_face(name));

CREATE POLICY "staff_faces_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'staff-faces' AND public.can_access_staff_face(name));
