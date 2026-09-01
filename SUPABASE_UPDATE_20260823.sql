BEGIN;

-- ===========================================================================
-- Z Sphere Database & RLS Access Fix
-- Resolves: 
-- 1. "permission denied for table user_roles" (42501) by making is_admin() STABLE SECURITY DEFINER
-- 2. Events not showing up when published_at is NULL on published/completed events
-- 3. Gallery albums / images not showing up due to RLS & is_published default values
-- ===========================================================================

-- 1. Helper function: is_admin()
-- Must be SECURITY DEFINER with search_path set so it runs with database owner privileges
-- and returns false for unauthenticated users without evaluating queries.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- 2. Schema and Table Permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.user_roles TO anon, authenticated;
GRANT SELECT ON public.events TO anon, authenticated;
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT SELECT ON public.gallery_albums TO anon, authenticated;
GRANT SELECT ON public.gallery_images TO anon, authenticated;
GRANT SELECT ON public.team_members TO anon, authenticated;

-- 3. Data Repair: Ensure existing records have valid publication defaults
UPDATE public.events 
SET published_at = COALESCE(published_at, created_at, now()) 
WHERE published_at IS NULL AND status IN ('published', 'completed', 'cancelled');

ALTER TABLE public.events ALTER COLUMN published_at SET DEFAULT now();

UPDATE public.gallery_albums 
SET is_published = true 
WHERE is_published IS NULL OR is_published = false;

ALTER TABLE public.gallery_albums ALTER COLUMN is_published SET DEFAULT true;

UPDATE public.gallery_images 
SET is_published = true 
WHERE is_published IS NULL;

ALTER TABLE public.gallery_images ALTER COLUMN is_published SET DEFAULT true;

-- 4. Clean up any existing policies dynamically to avoid "policy already exists" (42710) errors
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('events', 'gallery_albums', 'gallery_images', 'announcements', 'team_members', 'profiles', 'user_roles')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- 5. EVENTS RLS POLICIES
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_anon_read_published"
ON public.events
FOR SELECT
TO anon
USING (
  status IN ('published', 'completed', 'cancelled')
  AND (published_at IS NULL OR published_at <= now())
);

CREATE POLICY "events_authenticated_read_published_or_admin"
ON public.events
FOR SELECT
TO authenticated
USING (
  (
    status IN ('published', 'completed', 'cancelled')
    AND (published_at IS NULL OR published_at <= now())
  )
  OR public.is_admin()
);

CREATE POLICY "events_admin_insert" ON public.events FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "events_admin_update" ON public.events FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "events_admin_delete" ON public.events FOR DELETE TO authenticated USING (public.is_admin());

-- 6. GALLERY ALBUMS RLS POLICIES
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gallery_albums_anon_read_published"
ON public.gallery_albums
FOR SELECT
TO anon
USING (is_published = true);

CREATE POLICY "gallery_albums_authenticated_read_published_or_admin"
ON public.gallery_albums
FOR SELECT
TO authenticated
USING (is_published = true OR public.is_admin());

CREATE POLICY "gallery_albums_admin_all"
ON public.gallery_albums
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 7. GALLERY IMAGES RLS POLICIES
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gallery_images_anon_read_published"
ON public.gallery_images
FOR SELECT
TO anon
USING (
  is_published = true
  AND EXISTS (
    SELECT 1
    FROM public.gallery_albums ga
    WHERE ga.id = gallery_images.album_id
      AND ga.is_published = true
  )
);

CREATE POLICY "gallery_images_authenticated_read_published_or_admin"
ON public.gallery_images
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    is_published = true
    AND EXISTS (
      SELECT 1
      FROM public.gallery_albums ga
      WHERE ga.id = gallery_images.album_id
        AND ga.is_published = true
    )
  )
);

CREATE POLICY "gallery_images_admin_all"
ON public.gallery_images
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8. ANNOUNCEMENTS RLS POLICIES
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_audience_allowed;
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_audience_check CHECK (audience IN ('public', 'authenticated'));

CREATE POLICY "announcements_anon_read_public"
ON public.announcements
FOR SELECT
TO anon
USING (
  audience = 'public'
  AND (published_at IS NULL OR published_at <= now())
  AND (expires_at IS NULL OR expires_at > now())
);

CREATE POLICY "announcements_authenticated_read_visible"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  (
    audience IN ('public', 'authenticated')
    AND (published_at IS NULL OR published_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  )
  OR public.is_admin()
);

CREATE POLICY "announcements_admin_all"
ON public.announcements
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 9. TEAM MEMBERS RLS POLICIES
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_anon_read_active"
ON public.team_members
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "team_members_authenticated_read_active_or_admin"
ON public.team_members
FOR SELECT
TO authenticated
USING (is_active = true OR public.is_admin());

CREATE POLICY "team_members_admin_all"
ON public.team_members
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 10. USER ROLES & PROFILES POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 11. STORAGE BUCKET
UPDATE storage.buckets
SET public = true
WHERE id = 'public-media';

DROP POLICY IF EXISTS "Public can read public-media bucket" ON storage.objects;
DROP POLICY IF EXISTS "public_media_anon_read" ON storage.objects;
DROP POLICY IF EXISTS "public_media_anon_authenticated_read" ON storage.objects;

CREATE POLICY "public_media_anon_authenticated_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'public-media');

COMMIT;
