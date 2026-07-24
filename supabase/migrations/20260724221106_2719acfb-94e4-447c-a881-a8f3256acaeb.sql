
-- Uniform reference: owners write, merchant members read
CREATE POLICY "uniform_ref_owner_write" ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'uniform-reference'
    AND public.is_owner_or_admin(auth.uid())
    AND (storage.foldername(name))[1]::uuid IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'uniform-reference'
    AND public.is_owner_or_admin(auth.uid())
    AND (storage.foldername(name))[1]::uuid IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid()))
  );
CREATE POLICY "uniform_ref_merchant_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'uniform-reference'
    AND (storage.foldername(name))[1]::uuid IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid()))
  );

-- Staff checklist: staff upload own, owners view all in merchant
CREATE POLICY "staff_checklist_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-checklist'
    AND (
      public.is_owner_or_admin(auth.uid())
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
    AND (storage.foldername(name))[1]::uuid IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid()))
  );
CREATE POLICY "staff_checklist_staff_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-checklist'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
CREATE POLICY "staff_checklist_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-checklist'
    AND public.is_owner_or_admin(auth.uid())
    AND (storage.foldername(name))[1]::uuid IN (SELECT merchant_id FROM public.user_merchant_ids(auth.uid()))
  );
