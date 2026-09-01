-- ===========================================================================
-- Z Sphere Database Migration: Student Registrations & Admin Export Support
-- Date: 2026-08-25
-- ===========================================================================

BEGIN;

-- 1. Helper function: is_admin() (ensuring it is SECURITY DEFINER and STABLE)
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

-- 2. Create Registrations Table (if not exists)
CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled', 'waitlisted')),
  registered_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT registrations_pkey PRIMARY KEY (id),
  CONSTRAINT registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT registrations_event_user_unique UNIQUE (event_id, user_id)
);

-- 3. Indexes for fast lookup & filtering
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON public.registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_registered_at ON public.registrations(registered_at DESC);

-- 4. Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_registrations_updated_at ON public.registrations;
CREATE TRIGGER set_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 5. Automated trigger to keep events.registered_count perfectly synchronized
CREATE OR REPLACE FUNCTION public.update_event_registered_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.events
    SET registered_count = (
      SELECT count(*) FROM public.registrations 
      WHERE event_id = NEW.event_id AND status IN ('registered', 'attended')
    )
    WHERE id = NEW.event_id;
  END IF;
  
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.event_id <> NEW.event_id) THEN
    UPDATE public.events
    SET registered_count = (
      SELECT count(*) FROM public.registrations 
      WHERE event_id = OLD.event_id AND status IN ('registered', 'attended')
    )
    WHERE id = OLD.event_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_event_registered_count ON public.registrations;
CREATE TRIGGER trg_update_event_registered_count
  AFTER INSERT OR UPDATE OR DELETE ON public.registrations
  FOR EACH ROW EXECUTE PROCEDURE public.update_event_registered_count();

-- 6. Recalculate existing registered_counts
UPDATE public.events e
SET registered_count = COALESCE((
  SELECT count(*)
  FROM public.registrations r
  WHERE r.event_id = e.id AND r.status IN ('registered', 'attended')
), e.registered_count, 0);

-- 7. Permissions & Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT ON public.registrations TO anon;

-- 8. Row Level Security (RLS) Policies
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Clean existing registration policies to prevent duplicate policy errors
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'registrations'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.registrations', r.policyname);
    END LOOP;
END $$;

-- Policy A: Students can view their own registrations; Admins can view all registrations
CREATE POLICY "registrations_read_own_or_admin"
ON public.registrations
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.is_admin()
);

-- Policy B: Students can register (insert) themselves; Admins can insert any registration
CREATE POLICY "registrations_insert_own_or_admin"
ON public.registrations
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  OR public.is_admin()
);

-- Policy C: Students can update (e.g. cancel) their own registration; Admins can update any
CREATE POLICY "registrations_update_own_or_admin"
ON public.registrations
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.is_admin()
)
WITH CHECK (
  user_id = auth.uid() 
  OR public.is_admin()
);

-- Policy D: Admins can delete registrations
CREATE POLICY "registrations_admin_delete"
ON public.registrations
FOR DELETE
TO authenticated
USING (public.is_admin());

-- 9. Comprehensive Platform Metrics Function (reflects past + ongoing sessions)
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_events integer;
  v_total_registrations integer;
  v_total_albums integer;
  v_total_announcements integer;
  v_event_reg_sum integer;
  v_table_reg_count integer;
BEGIN
  -- Count all sessions (published, upcoming, and past completed)
  SELECT count(*) INTO v_total_events 
  FROM public.events 
  WHERE status IN ('published', 'completed', 'upcoming');

  -- Count in-app registrations table rows
  SELECT count(*) INTO v_table_reg_count 
  FROM public.registrations 
  WHERE status IN ('registered', 'attended');

  -- Sum all student registrations & attendance counts across ALL events (both past and ongoing)
  SELECT COALESCE(SUM(GREATEST(COALESCE(registered_count, 0), COALESCE(attendance_count, 0))), 0) 
  INTO v_event_reg_sum
  FROM public.events;

  -- True cumulative total of past and active registrations
  v_total_registrations := GREATEST(v_table_reg_count, v_event_reg_sum);

  -- Count public gallery albums
  SELECT count(*) INTO v_total_albums 
  FROM public.gallery_albums 
  WHERE is_published = true;

  -- Count announcements
  SELECT count(*) INTO v_total_announcements 
  FROM public.announcements;

  RETURN jsonb_build_object(
    'total_sessions', GREATEST(v_total_events, 0),
    'total_registrations', GREATEST(v_total_registrations, 0),
    'total_albums', GREATEST(v_total_albums, 0),
    'total_announcements', GREATEST(v_total_announcements, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated, service_role;

COMMIT;
