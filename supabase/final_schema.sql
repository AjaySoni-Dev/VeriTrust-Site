-- 26. FINAL AUTHORITATIVE DATABASE SCHEMA

-- Helper functions
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_path)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- auth trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Tables
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text CHECK (full_name IS NULL OR char_length(full_name) >= 2 AND char_length(full_name) <= 100),
  course text CHECK (course IS NULL OR char_length(course) >= 1 AND char_length(course) <= 120),
  semester smallint CHECK (semester IS NULL OR semester >= 1 AND semester <= 12),
  avatar_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = 'admin'::text),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
  title text NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 160),
  summary text NOT NULL CHECK (char_length(summary) >= 10 AND char_length(summary) <= 320),
  description text NOT NULL DEFAULT ''::text,
  event_type text NOT NULL DEFAULT 'workshop'::text CHECK (event_type = ANY (ARRAY['workshop'::text, 'hackathon'::text, 'demo'::text, 'session'::text, 'other'::text])),
  category text,
  mode text CHECK (mode IN ('in-person', 'online', 'hybrid')),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'completed'::text, 'cancelled'::text])),
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone,
  venue text NOT NULL,
  registration_opens_at timestamp with time zone,
  registration_closes_at timestamp with time zone,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  registered_count integer NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
  registration_form_url text,
  whatsapp_group_url text,
  attendance_count integer CHECK (attendance_count >= 0),
  feedback_response_count integer CHECK (feedback_response_count >= 0),
  feedback_summary text,
  attendance_summary_url text,
  feedback_report_url text,
  verification_report_url text,
  cover_path text,
  learning_points ARRAY NOT NULL DEFAULT '{}'::text[],
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(agenda) = 'array'::text),
  resources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(resources) = 'array'::text),
  conducted_by text,
  featured boolean NOT NULL DEFAULT false,
  published_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE INDEX IF NOT EXISTS idx_events_status_start_at ON public.events(status, start_at);
CREATE INDEX IF NOT EXISTS idx_events_published_at ON public.events(published_at);

CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 160),
  body text NOT NULL CHECK (char_length(body) >= 3 AND char_length(body) <= 2000),
  event_id uuid,
  audience text NOT NULL DEFAULT 'public'::text CHECK (audience = ANY (ARRAY['public'::text, 'authenticated'::text])),
  priority text NOT NULL DEFAULT 'normal'::text CHECK (priority = ANY (ARRAY['normal'::text, 'important'::text])),
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL,
  CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON public.announcements(published_at);

CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT announcement_reads_pkey PRIMARY KEY (announcement_id, user_id),
  CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE,
  CONSTRAINT announcement_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE public.gallery_albums (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
  title text NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 160),
  cover_path text,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gallery_albums_pkey PRIMARY KEY (id),
  CONSTRAINT gallery_albums_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT gallery_albums_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.gallery_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  alt_text text NOT NULL CHECK (char_length(alt_text) >= 2 AND char_length(alt_text) <= 240),
  caption text CHECK (caption IS NULL OR char_length(caption) <= 500),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gallery_images_pkey PRIMARY KEY (id),
  CONSTRAINT gallery_images_album_id_fkey FOREIGN KEY (album_id) REFERENCES public.gallery_albums(id) ON DELETE CASCADE,
  CONSTRAINT gallery_images_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  role_title text NOT NULL CHECK (char_length(role_title) >= 2 AND char_length(role_title) <= 120),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 500),
  photo_path text,
  linkedin_url text,
  github_url text,
  group_name text NOT NULL DEFAULT 'core'::text CHECK (group_name = ANY (ARRAY['leadership'::text, 'core'::text])),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_members_pkey PRIMARY KEY (id)
);

-- RLS Enablement
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public can read profiles" ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- User Roles Policies
CREATE POLICY "Users can read their own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Events Policies
CREATE POLICY "events_anon_read_published" ON public.events
FOR SELECT TO anon
USING (status IN ('published', 'completed', 'cancelled') AND (published_at IS NULL OR published_at <= now()));

CREATE POLICY "events_authenticated_read_published_or_admin" ON public.events
FOR SELECT TO authenticated
USING ((status IN ('published', 'completed', 'cancelled') AND (published_at IS NULL OR published_at <= now())) OR public.is_admin());

CREATE POLICY "Admins can insert events" ON public.events FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update events" ON public.events FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete events" ON public.events FOR DELETE TO authenticated USING (public.is_admin());

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.user_roles TO anon, authenticated;
GRANT SELECT ON public.events TO anon, authenticated;
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT SELECT ON public.gallery_albums TO anon, authenticated;
GRANT SELECT ON public.gallery_images TO anon, authenticated;
GRANT SELECT ON public.team_members TO anon, authenticated;

-- Announcements Policies
CREATE POLICY "announcements_anon_read_public" ON public.announcements
FOR SELECT TO anon
USING (audience = 'public' AND (published_at IS NULL OR published_at <= now()) AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "announcements_authenticated_read_visible" ON public.announcements
FOR SELECT TO authenticated
USING (((audience IN ('public', 'authenticated')) AND (published_at IS NULL OR published_at <= now()) AND (expires_at IS NULL OR expires_at > now())) OR public.is_admin());

CREATE POLICY "Admins can manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Announcement Reads Policies
CREATE POLICY "Users manage own reads" ON public.announcement_reads FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Gallery Albums Policies
CREATE POLICY "gallery_albums_anon_read_published" ON public.gallery_albums FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "gallery_albums_authenticated_read_published_or_admin" ON public.gallery_albums FOR SELECT TO authenticated USING (is_published = true OR public.is_admin());
CREATE POLICY "Admins can manage albums" ON public.gallery_albums FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Gallery Images Policies
CREATE POLICY "gallery_images_anon_read_published" ON public.gallery_images
FOR SELECT TO anon
USING (is_published = true AND EXISTS (SELECT 1 FROM public.gallery_albums ga WHERE ga.id = gallery_images.album_id AND ga.is_published = true));

CREATE POLICY "gallery_images_authenticated_read_published_or_admin" ON public.gallery_images
FOR SELECT TO authenticated
USING (public.is_admin() OR (is_published = true AND EXISTS (SELECT 1 FROM public.gallery_albums ga WHERE ga.id = gallery_images.album_id AND ga.is_published = true)));

CREATE POLICY "Admins can manage images" ON public.gallery_images FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Team Members Policies
CREATE POLICY "team_members_anon_read_active" ON public.team_members FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "team_members_authenticated_read_active_or_admin" ON public.team_members FOR SELECT TO authenticated USING (is_active = true OR public.is_admin());
CREATE POLICY "Admins can manage team members" ON public.team_members FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

