BEGIN;

-- Z Sphere public browsing policy reset
-- Goal: guests can browse published events, public announcements, gallery albums/images,
-- and active team members. Authentication is required only to receive registration/community links.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- EVENTS: public details for anon, registration links only for authenticated.
-- ---------------------------------------------------------------------------
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Remove overlapping/legacy public-read policies. One of the historic policies used
-- USING (true), which made draft rows visible whenever it co-existed with other permissive policies.
DROP POLICY IF EXISTS "Public can read published events" ON public.events;
DROP POLICY IF EXISTS "Public can view published events" ON public.events;
DROP POLICY IF EXISTS "events_public_read" ON public.events;
DROP POLICY IF EXISTS "events_authenticated_read" ON public.events;

CREATE POLICY "events_anon_read_published"
ON public.events
FOR SELECT
TO anon
USING (
  status IN ('published', 'completed', 'cancelled')
  AND published_at IS NOT NULL
  AND published_at <= now()
);

CREATE POLICY "events_authenticated_read_published_or_admin"
ON public.events
FOR SELECT
TO authenticated
USING (
  (
    status IN ('published', 'completed', 'cancelled')
    AND published_at IS NOT NULL
    AND published_at <= now()
  )
  OR public.is_admin()
);

-- Guests can query the event information needed by the public UI, but cannot read
-- the external registration form URL or WhatsApp group URL directly from PostgREST.
REVOKE SELECT ON public.events FROM anon;
GRANT SELECT (
  id, slug, title, summary, description, event_type, category, mode, status,
  start_at, end_at, venue, registration_opens_at, registration_closes_at,
  capacity, registered_count, attendance_count, feedback_response_count,
  feedback_summary, attendance_summary_url, feedback_report_url,
  verification_report_url, cover_path, learning_points, agenda, resources,
  conducted_by, featured, published_at, created_at, updated_at
) ON public.events TO anon;

-- Signed-in users may receive registration/community links; RLS still controls rows.
GRANT SELECT ON public.events TO authenticated;

-- ---------------------------------------------------------------------------
-- ANNOUNCEMENTS: public audience for guests; authenticated audience after sign-in.
-- ---------------------------------------------------------------------------
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Remove a stale legacy check constraint if it still exists. Keeping both the old
-- ('registered') and new ('authenticated') checks would effectively allow only 'public'.
ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_audience_allowed;

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_audience_check;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_audience_check
  CHECK (audience IN ('public', 'authenticated'));

DROP POLICY IF EXISTS "Public can view announcements" ON public.announcements;
DROP POLICY IF EXISTS "Public can view public announcements" ON public.announcements;
DROP POLICY IF EXISTS "Public can read public announcements" ON public.announcements;
DROP POLICY IF EXISTS "Users can view registered announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authenticated can read authenticated announcements" ON public.announcements;
DROP POLICY IF EXISTS "announcements_anon_public_read" ON public.announcements;
DROP POLICY IF EXISTS "announcements_authenticated_read" ON public.announcements;

CREATE POLICY "announcements_anon_read_public"
ON public.announcements
FOR SELECT
TO anon
USING (
  audience = 'public'
  AND published_at <= now()
  AND (expires_at IS NULL OR expires_at > now())
);

CREATE POLICY "announcements_authenticated_read_visible"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  (
    audience IN ('public', 'authenticated')
    AND published_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  )
  OR public.is_admin()
);

GRANT SELECT ON public.announcements TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- GALLERY / MEMORIES: published albums and images are public.
-- ---------------------------------------------------------------------------
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published albums" ON public.gallery_albums;
DROP POLICY IF EXISTS "Public can view published gallery albums" ON public.gallery_albums;
DROP POLICY IF EXISTS "Public can read published albums" ON public.gallery_albums;
DROP POLICY IF EXISTS "gallery_albums_anon_read" ON public.gallery_albums;
DROP POLICY IF EXISTS "gallery_albums_authenticated_read" ON public.gallery_albums;

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

DROP POLICY IF EXISTS "Public can view published images" ON public.gallery_images;
DROP POLICY IF EXISTS "Public can view published gallery images" ON public.gallery_images;
DROP POLICY IF EXISTS "Public can read published images" ON public.gallery_images;
DROP POLICY IF EXISTS "gallery_images_anon_read" ON public.gallery_images;
DROP POLICY IF EXISTS "gallery_images_authenticated_read" ON public.gallery_images;

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

GRANT SELECT ON public.gallery_albums, public.gallery_images TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- TEAM: active public members are browseable without login.
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active team members" ON public.team_members;
DROP POLICY IF EXISTS "Public can read active members" ON public.team_members;
DROP POLICY IF EXISTS "team_members_anon_read" ON public.team_members;
DROP POLICY IF EXISTS "team_members_authenticated_read" ON public.team_members;

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

GRANT SELECT ON public.team_members TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- STORAGE: public-media contains public event/gallery/team images.
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET public = true
WHERE id = 'public-media';

DROP POLICY IF EXISTS "Public can read public-media bucket" ON storage.objects;
DROP POLICY IF EXISTS "public_media_anon_read" ON storage.objects;

CREATE POLICY "public_media_anon_authenticated_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'public-media');

COMMIT;
