-- Create the menu-images storage bucket (public, so images are accessible without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-images',
  'menu-images',
  true,
  10485760,  -- 10 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = 10485760,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

-- ─────────────────────────────────────────────
-- Storage RLS policies for menu-images bucket
-- ─────────────────────────────────────────────

-- 1. Anyone can view / download images (public bucket)
DROP POLICY IF EXISTS "menu-images: public read" ON storage.objects;
CREATE POLICY "menu-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

-- 2. Authenticated users can upload images
DROP POLICY IF EXISTS "menu-images: authenticated upload" ON storage.objects;
CREATE POLICY "menu-images: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'menu-images');

-- 3. Authenticated users can update their own uploaded images
DROP POLICY IF EXISTS "menu-images: authenticated update" ON storage.objects;
CREATE POLICY "menu-images: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'menu-images');

-- 4. Authenticated users can delete images
DROP POLICY IF EXISTS "menu-images: authenticated delete" ON storage.objects;
CREATE POLICY "menu-images: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'menu-images');
