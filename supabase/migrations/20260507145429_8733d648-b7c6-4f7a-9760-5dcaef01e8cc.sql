
-- Enums
CREATE TYPE public.course_status AS ENUM ('available', 'full', 'completed', 'cancelled');
CREATE TYPE public.registration_status AS ENUM ('registered', 'cancelled');

-- Tables
CREATE TABLE public.health_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  max_participants INTEGER NOT NULL DEFAULT 10,
  provider_id UUID NOT NULL,
  status public.course_status NOT NULL DEFAULT 'available',
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.course_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.health_courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status public.registration_status NOT NULL DEFAULT 'registered',
  attendance_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);

CREATE INDEX idx_course_registrations_course ON public.course_registrations(course_id);
CREATE INDEX idx_course_registrations_user ON public.course_registrations(user_id);
CREATE INDEX idx_health_courses_provider ON public.health_courses(provider_id);

-- updated_at trigger
CREATE TRIGGER trg_health_courses_updated
  BEFORE UPDATE ON public.health_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger: enforce capacity & end > start
CREATE OR REPLACE FUNCTION public.validate_course_registration()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cap INTEGER;
  current_count INTEGER;
  c_status public.course_status;
BEGIN
  IF NEW.status = 'registered' THEN
    SELECT max_participants, status INTO cap, c_status FROM public.health_courses WHERE id = NEW.course_id;
    IF c_status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'Anmeldung nicht möglich: Kurs ist %', c_status;
    END IF;
    SELECT COUNT(*) INTO current_count FROM public.course_registrations
      WHERE course_id = NEW.course_id AND status = 'registered'
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF current_count >= cap THEN
      RAISE EXCEPTION 'Kurs ist ausgebucht';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_course_registration
  BEFORE INSERT OR UPDATE ON public.course_registrations
  FOR EACH ROW EXECUTE FUNCTION public.validate_course_registration();

CREATE OR REPLACE FUNCTION public.validate_course_times()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_course_times
  BEFORE INSERT OR UPDATE ON public.health_courses
  FOR EACH ROW EXECUTE FUNCTION public.validate_course_times();

-- RLS
ALTER TABLE public.health_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registrations ENABLE ROW LEVEL SECURITY;

-- health_courses policies
CREATE POLICY "All authenticated can view courses"
  ON public.health_courses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage all courses - insert"
  ON public.health_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage all courses - update"
  ON public.health_courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage all courses - delete"
  ON public.health_courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Physiotherapy create own courses"
  ON public.health_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'physiotherapy') AND provider_id = auth.uid());

CREATE POLICY "Physiotherapy update own courses"
  ON public.health_courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'physiotherapy') AND provider_id = auth.uid());

CREATE POLICY "Physiotherapy delete own courses"
  ON public.health_courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'physiotherapy') AND provider_id = auth.uid());

-- course_registrations policies
CREATE POLICY "Users view own registrations"
  ON public.course_registrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all registrations"
  ON public.course_registrations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Provider views own course registrations"
  ON public.course_registrations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.health_courses c
    WHERE c.id = course_registrations.course_id AND c.provider_id = auth.uid()
  ));

CREATE POLICY "Users register themselves"
  ON public.course_registrations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own registration"
  ON public.course_registrations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own registration"
  ON public.course_registrations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage registrations - update"
  ON public.course_registrations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage registrations - delete"
  ON public.course_registrations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Provider manages own course registrations - delete"
  ON public.course_registrations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.health_courses c
    WHERE c.id = course_registrations.course_id AND c.provider_id = auth.uid()
  ));
