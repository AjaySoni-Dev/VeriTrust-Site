BEGIN;

-- 1. Helper functions / prerequisites
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
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2. Events schema additions
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS mode text CHECK (mode IN ('in-person', 'online', 'hybrid')),
ADD COLUMN IF NOT EXISTS registration_form_url text,
ADD COLUMN IF NOT EXISTS whatsapp_group_url text,
ADD COLUMN IF NOT EXISTS registered_count integer NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
ADD COLUMN IF NOT EXISTS attendance_count integer CHECK (attendance_count >= 0),
ADD COLUMN IF NOT EXISTS feedback_response_count integer CHECK (feedback_response_count >= 0),
ADD COLUMN IF NOT EXISTS feedback_summary text,
ADD COLUMN IF NOT EXISTS attendance_summary_url text,
ADD COLUMN IF NOT EXISTS feedback_report_url text,
ADD COLUMN IF NOT EXISTS verification_report_url text;

-- 3. Data migration from old registrations
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'registrations') THEN
    UPDATE public.events e
    SET registered_count = COALESCE((
      SELECT count(*)
      FROM public.registrations r
      WHERE r.event_id = e.id AND r.status IN ('registered', 'attended')
    ), 0);
  END IF;
END $$;

-- 4. Announcement audience migration
UPDATE public.announcements
SET audience = 'authenticated'
WHERE audience = 'registered';

ALTER TABLE public.announcements
DROP CONSTRAINT IF EXISTS announcements_audience_check;

ALTER TABLE public.announcements
ADD CONSTRAINT announcements_audience_check 
CHECK (audience IN ('public', 'authenticated'));

-- 5. Profile/auth trigger
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. updated_at triggers
DROP TRIGGER IF EXISTS set_events_updated_at ON public.events;
CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_events_status_start_at ON public.events(status, start_at);
CREATE INDEX IF NOT EXISTS idx_events_published_at ON public.events(published_at);
CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON public.announcements(published_at);

-- 8. Drop obsolete registration RPCs
DROP FUNCTION IF EXISTS public.register_for_event(uuid);
DROP FUNCTION IF EXISTS public.register_for_event(uuid, uuid);
DROP FUNCTION IF EXISTS public.cancel_event_registration(uuid);
DROP FUNCTION IF EXISTS public.cancel_event_registration(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_event_availability(uuid);
DROP FUNCTION IF EXISTS public.admin_set_registration_status(uuid, text);
DROP FUNCTION IF EXISTS public.admin_set_registration_status(uuid, uuid, text);

-- 9. Drop registrations
DROP TABLE IF EXISTS public.registrations CASCADE;

-- 10. Enable RLS and 11. RLS Policies
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Events Policies
DROP POLICY IF EXISTS "Public can read published events" ON public.events;
CREATE POLICY "Public can read published events"
ON public.events FOR SELECT
TO public
USING (status IN ('published', 'completed', 'cancelled'));

DROP POLICY IF EXISTS "Admins can read all events" ON public.events;
CREATE POLICY "Admins can read all events"
ON public.events FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert events" ON public.events;
CREATE POLICY "Admins can insert events"
ON public.events FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update events" ON public.events;
CREATE POLICY "Admins can update events"
ON public.events FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete events" ON public.events;
CREATE POLICY "Admins can delete events"
ON public.events FOR DELETE
TO authenticated
USING (public.is_admin());

-- Roles Policies
DROP POLICY IF EXISTS "Users can read their own role" ON public.user_roles;
CREATE POLICY "Users can read their own role"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins can read all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_admin());

-- Profiles Policies
DROP POLICY IF EXISTS "Public can read profiles" ON public.profiles;
CREATE POLICY "Public can read profiles"
ON public.profiles FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

COMMIT;
