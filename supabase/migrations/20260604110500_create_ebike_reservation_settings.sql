CREATE TABLE IF NOT EXISTS public.ebike_reservation_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  safety_confirmation_enabled BOOLEAN NOT NULL DEFAULT false,
  safety_confirmation_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ebike_reservation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view ebike reservation settings"
  ON public.ebike_reservation_settings;
CREATE POLICY "Authenticated view ebike reservation settings"
  ON public.ebike_reservation_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins insert ebike reservation settings"
  ON public.ebike_reservation_settings;
CREATE POLICY "Admins insert ebike reservation settings"
  ON public.ebike_reservation_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update ebike reservation settings"
  ON public.ebike_reservation_settings;
CREATE POLICY "Admins update ebike reservation settings"
  ON public.ebike_reservation_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete ebike reservation settings"
  ON public.ebike_reservation_settings;
CREATE POLICY "Admins delete ebike reservation settings"
  ON public.ebike_reservation_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_ebike_reservation_settings_updated_at
  ON public.ebike_reservation_settings;
CREATE TRIGGER update_ebike_reservation_settings_updated_at
  BEFORE UPDATE ON public.ebike_reservation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ebike_reservation_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ebike_reservations
  ADD COLUMN IF NOT EXISTS safety_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safety_confirmation_text TEXT;

ALTER TABLE public.ebike_reservation_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
    ADD TABLE public.ebike_reservation_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ebike_reservation_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_start TIMESTAMP;
  local_end TIMESTAMP;
  availability RECORD;
  reservation_settings public.ebike_reservation_settings%ROWTYPE;
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;

  IF NEW.status = 'active' THEN
    local_start := NEW.start_time AT TIME ZONE 'Europe/Berlin';
    local_end := NEW.end_time AT TIME ZONE 'Europe/Berlin';

    IF local_start::date <> local_end::date THEN
      RAISE EXCEPTION 'E-Bike-Reservierungen müssen innerhalb eines Tages liegen';
    END IF;

    SELECT *
      INTO availability
      FROM public.ebike_availability_windows
      WHERE day_of_week = EXTRACT(DOW FROM local_start)::integer;

    IF availability.id IS NULL
       OR availability.active IS NOT TRUE
       OR local_start::time < availability.start_time
       OR local_end::time > availability.end_time THEN
      RAISE EXCEPTION 'Dieses E-Bike kann nur innerhalb der freigegebenen Zeiten reserviert werden';
    END IF;

    SELECT *
      INTO reservation_settings
      FROM public.ebike_reservation_settings
      WHERE id = 'default';

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
