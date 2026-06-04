ALTER TABLE public.health_course_settings
  ADD COLUMN IF NOT EXISTS allow_same_course_multiple_registrations BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_active_registrations_per_user INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'health_course_settings_max_active_registrations_nonnegative'
  ) THEN
    ALTER TABLE public.health_course_settings
      ADD CONSTRAINT health_course_settings_max_active_registrations_nonnegative
      CHECK (max_active_registrations_per_user >= 0);
  END IF;
END $$;

INSERT INTO public.health_course_settings (
  id,
  allow_same_course_multiple_registrations,
  max_active_registrations_per_user
)
VALUES ('default', true, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_course_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cap INTEGER;
  current_count INTEGER;
  c_status public.course_status;
  c_title TEXT;
  c_category TEXT;
  duplicate_allowed BOOLEAN := true;
  max_active INTEGER := 0;
  active_count INTEGER;
  same_course_count INTEGER;
  should_validate BOOLEAN := false;
BEGIN
  IF NEW.status = 'registered' THEN
    IF TG_OP = 'INSERT' THEN
      should_validate := true;
    ELSIF TG_OP = 'UPDATE' THEN
      should_validate :=
        NEW.status IS DISTINCT FROM OLD.status
        OR NEW.course_id IS DISTINCT FROM OLD.course_id
        OR NEW.user_id IS DISTINCT FROM OLD.user_id;
    END IF;
  END IF;

  IF should_validate THEN
    SELECT
      max_participants,
      status,
      title,
      category
    INTO
      cap,
      c_status,
      c_title,
      c_category
    FROM public.health_courses
    WHERE id = NEW.course_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kurs wurde nicht gefunden';
    END IF;

    IF c_status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'Anmeldung nicht möglich: Kurs ist %', c_status;
    END IF;

    SELECT COUNT(*) INTO current_count
    FROM public.course_registrations
    WHERE course_id = NEW.course_id
      AND status = 'registered'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF current_count >= cap THEN
      RAISE EXCEPTION 'Kurs ist ausgebucht';
    END IF;

    SELECT
      COALESCE((
        SELECT allow_same_course_multiple_registrations
        FROM public.health_course_settings
        WHERE id = 'default'
      ), true),
      GREATEST(COALESCE((
        SELECT max_active_registrations_per_user
        FROM public.health_course_settings
        WHERE id = 'default'
      ), 0), 0)
    INTO duplicate_allowed, max_active;

    SELECT COUNT(*) INTO active_count
    FROM public.course_registrations registration
    JOIN public.health_courses course
      ON course.id = registration.course_id
    WHERE registration.user_id = NEW.user_id
      AND registration.status = 'registered'
      AND registration.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND course.status <> 'cancelled'
      AND course.end_time >= now();

    IF max_active > 0 AND active_count >= max_active THEN
      RAISE EXCEPTION 'Maximale Anzahl aktiver Kursanmeldungen erreicht';
    END IF;

    IF NOT duplicate_allowed THEN
      SELECT COUNT(*) INTO same_course_count
      FROM public.course_registrations registration
      JOIN public.health_courses course
        ON course.id = registration.course_id
      WHERE registration.user_id = NEW.user_id
        AND registration.status = 'registered'
        AND registration.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND course.status <> 'cancelled'
        AND course.end_time >= now()
        AND lower(btrim(course.title)) = lower(btrim(c_title))
        AND lower(btrim(COALESCE(course.category, ''))) =
            lower(btrim(COALESCE(c_category, '')));

      IF same_course_count > 0 THEN
        RAISE EXCEPTION 'Dieser Kurs ist bereits aktiv gebucht';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
