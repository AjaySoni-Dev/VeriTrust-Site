BEGIN;

-- 1. Ensure end_at > start_at constraint on events
ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_time_check;

ALTER TABLE public.events
ADD CONSTRAINT events_time_check CHECK (end_at IS NULL OR end_at > start_at);

-- 2. Ensure public-media bucket exists (if not created via dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-media',
  'public-media',
  true,
  8388608, -- 8MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;



-- 4. Storage Policies for public-media bucket
DROP POLICY IF EXISTS "Public can read public-media bucket" ON storage.objects;
CREATE POLICY "Public can read public-media bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'public-media');

DROP POLICY IF EXISTS "Admins can insert into public-media bucket" ON storage.objects;
CREATE POLICY "Admins can insert into public-media bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'public-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can update public-media bucket" ON storage.objects;
CREATE POLICY "Admins can update public-media bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'public-media' AND public.is_admin())
WITH CHECK (bucket_id = 'public-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete from public-media bucket" ON storage.objects;
CREATE POLICY "Admins can delete from public-media bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'public-media' AND public.is_admin());

COMMIT;
