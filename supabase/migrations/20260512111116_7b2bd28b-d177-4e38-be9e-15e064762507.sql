
-- 1. Physiotherapy can view profiles of participants in own courses
CREATE POLICY "Provider views participant profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.course_registrations cr
    JOIN public.health_courses c ON c.id = cr.course_id
    WHERE cr.user_id = profiles.id
      AND c.provider_id = auth.uid()
  )
);

-- 3 + 9. Course time validation: no past start (5 min grace) on insert/start change, min 15 min, max 8h duration
CREATE OR REPLACE FUNCTION public.validate_course_times()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;

  IF (NEW.end_time - NEW.start_time) < interval '15 minutes' THEN
    RAISE EXCEPTION 'Kursdauer muss mindestens 15 Minuten betragen';
  END IF;

  IF (NEW.end_time - NEW.start_time) > interval '8 hours' THEN
    RAISE EXCEPTION 'Kursdauer darf maximal 8 Stunden betragen';
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.start_time IS DISTINCT FROM OLD.start_time)
     AND NEW.start_time < (now() - interval '5 minutes')
     AND NEW.status = 'available' THEN
    RAISE EXCEPTION 'Startzeit darf nicht in der Vergangenheit liegen';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_course_times ON public.health_courses;
CREATE TRIGGER trg_validate_course_times
BEFORE INSERT OR UPDATE ON public.health_courses
FOR EACH ROW EXECUTE FUNCTION public.validate_course_times();

-- 8. Status consistency: prevent setting 'available' when course is full or already ended
CREATE OR REPLACE FUNCTION public.validate_course_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  registered_count integer;
BEGIN
  IF NEW.status = 'available' THEN
    IF NEW.end_time < now() THEN
      RAISE EXCEPTION 'Vergangene Kurse können nicht auf "Verfügbar" gesetzt werden';
    END IF;
    SELECT COUNT(*) INTO registered_count
      FROM public.course_registrations
      WHERE course_id = NEW.id AND status = 'registered';
    IF registered_count >= NEW.max_participants THEN
      RAISE EXCEPTION 'Kurs ist ausgebucht und kann nicht auf "Verfügbar" gesetzt werden';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_course_status ON public.health_courses;
CREATE TRIGGER trg_validate_course_status
BEFORE UPDATE ON public.health_courses
FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.validate_course_status();

-- 10. Cancellation cutoff: users cannot cancel within 24h of course start
CREATE OR REPLACE FUNCTION public.validate_registration_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c_start timestamptz;
  c_status public.course_status;
BEGIN
  -- Only check on user-initiated cancellation (status -> cancelled)
  IF NEW.status = 'cancelled' AND OLD.status = 'registered' THEN
    SELECT start_time, status INTO c_start, c_status
      FROM public.health_courses WHERE id = NEW.course_id;
    -- Allow if course itself was cancelled
    IF c_status <> 'cancelled' AND c_start - now() < interval '24 hours' AND auth.uid() = NEW.user_id THEN
      -- Admins/providers may bypass
      IF NOT public.has_role(auth.uid(), 'admin')
         AND NOT EXISTS (
           SELECT 1 FROM public.health_courses
           WHERE id = NEW.course_id AND provider_id = auth.uid()
         ) THEN
        RAISE EXCEPTION 'Stornierung nur bis 24 Stunden vor Kursbeginn möglich';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_registration_cancellation ON public.course_registrations;
CREATE TRIGGER trg_validate_registration_cancellation
BEFORE UPDATE ON public.course_registrations
FOR EACH ROW EXECUTE FUNCTION public.validate_registration_cancellation();

-- 4. Auto-complete expired courses
CREATE OR REPLACE FUNCTION public.complete_expired_health_courses()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.health_courses
  SET status = 'completed'
  WHERE status = 'available' AND end_time < now();
$$;

-- pg_cron job: daily at 02:00
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complete-expired-health-courses') THEN
    PERFORM cron.unschedule('complete-expired-health-courses');
  END IF;
  PERFORM cron.schedule(
    'complete-expired-health-courses',
    '0 2 * * *',
    $cron$ SELECT public.complete_expired_health_courses(); $cron$
  );
END $$;

-- 5. Realtime
ALTER TABLE public.health_courses REPLICA IDENTITY FULL;
ALTER TABLE public.course_registrations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'health_courses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.health_courses;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'course_registrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.course_registrations;
  END IF;
END $$;
