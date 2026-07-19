
CREATE POLICY "staff_faces_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'staff-faces');
CREATE POLICY "staff_faces_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'staff-faces');
CREATE POLICY "staff_faces_update_auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'staff-faces') WITH CHECK (bucket_id = 'staff-faces');
CREATE POLICY "staff_faces_delete_auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'staff-faces');
