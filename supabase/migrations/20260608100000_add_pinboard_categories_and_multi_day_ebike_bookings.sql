ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE TABLE IF NOT EXISTS public.news_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  categories TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.news_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view news settings"
  ON public.news_settings;
CREATE POLICY "Authenticated view news settings"
  ON public.news_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins insert news settings"
  ON public.news_settings;
CREATE POLICY "Admins insert news settings"
  ON public.news_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update news settings"
  ON public.news_settings;
CREATE POLICY "Admins update news settings"
  ON public.news_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete news settings"
  ON public.news_settings;
CREATE POLICY "Admins delete news settings"
  ON public.news_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_news_settings_updated_at
  ON public.news_settings;
CREATE TRIGGER update_news_settings_updated_at
  BEFORE UPDATE ON public.news_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.news_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.news_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
    ADD TABLE public.news_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;

ALTER TABLE public.ebike_reservation_settings
  ADD COLUMN IF NOT EXISTS max_booking_days INTEGER NOT NULL DEFAULT 14;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ebike_reservation_settings_max_booking_days_positive'
  ) THEN
    ALTER TABLE public.ebike_reservation_settings
      ADD CONSTRAINT ebike_reservation_settings_max_booking_days_positive
      CHECK (max_booking_days >= 1);
  END IF;
END $$;

UPDATE public.ebike_reservation_settings
SET max_booking_days = 14
WHERE id = 'default'
  AND max_booking_days IS NULL;

CREATE OR REPLACE FUNCTION public.check_ebike_reservation_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_start TIMESTAMP;
  local_end TIMESTAMP;
  start_availability RECORD;
  end_availability RECORD;
  reservation_settings public.ebike_reservation_settings%ROWTYPE;
  max_booking_days INTEGER := 14;
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;

  IF NEW.status = 'active' THEN
    IF NEW.start_time < date_trunc('minute', now()) + interval '10 minutes' THEN
      RAISE EXCEPTION 'E-Bike-Reservierungen sind frühestens 10 Minuten im Voraus möglich';
    END IF;

    SELECT *
      INTO reservation_settings
      FROM public.ebike_reservation_settings
      WHERE id = 'default';

    max_booking_days := GREATEST(
      COALESCE(reservation_settings.max_booking_days, 14),
      1
    );

    IF NEW.end_time > NEW.start_time + make_interval(days => max_booking_days) THEN
      RAISE EXCEPTION 'E-Bike-Reservierungen sind maximal % Tage möglich', max_booking_days;
    END IF;

    local_start := NEW.start_time AT TIME ZONE 'Europe/Berlin';
    local_end := NEW.end_time AT TIME ZONE 'Europe/Berlin';

    SELECT *
      INTO start_availability
      FROM public.ebike_availability_windows
      WHERE day_of_week = EXTRACT(DOW FROM local_start)::integer;

    IF start_availability.id IS NULL
       OR start_availability.active IS NOT TRUE
       OR local_start::time < start_availability.start_time
       OR local_start::time > start_availability.end_time THEN
      RAISE EXCEPTION 'Dieses E-Bike kann nur innerhalb der freigegebenen Zeiten reserviert werden';
    END IF;

    SELECT *
      INTO end_availability
      FROM public.ebike_availability_windows
      WHERE day_of_week = EXTRACT(DOW FROM local_end)::integer;

    IF end_availability.id IS NULL
       OR end_availability.active IS NOT TRUE
       OR local_end::time < end_availability.start_time
       OR local_end::time > end_availability.end_time THEN
      RAISE EXCEPTION 'Dieses E-Bike kann nur innerhalb der freigegebenen Zeiten reserviert werden';
    END IF;

    IF COALESCE(reservation_settings.safety_confirmation_enabled, false)
       AND btrim(COALESCE(reservation_settings.safety_confirmation_text, '')) <> ''
       AND (
         NEW.safety_confirmed_at IS NULL
         OR COALESCE(NEW.safety_confirmation_text, '') <> reservation_settings.safety_confirmation_text
       ) THEN
      RAISE EXCEPTION 'Bitte Sicherheitsbestätigung vor der E-Bike-Reservierung bestätigen';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ebike_reservations r
      WHERE r.ebike_id = NEW.ebike_id
        AND r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND r.status = 'active'
        AND r.start_time < NEW.end_time
        AND r.end_time > NEW.start_time
    ) THEN
      RAISE EXCEPTION 'Dieses E-Bike ist im gewählten Zeitraum bereits reserviert';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
