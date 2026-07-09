ALTER TABLE public.ebike_reservation_settings
  ALTER COLUMN max_booking_days SET DEFAULT 7;

UPDATE public.ebike_reservation_settings
SET max_booking_days = LEAST(GREATEST(COALESCE(max_booking_days, 7), 1), 7);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ebike_reservation_settings_max_booking_days_one_week'
  ) THEN
    ALTER TABLE public.ebike_reservation_settings
      ADD CONSTRAINT ebike_reservation_settings_max_booking_days_one_week
      CHECK (max_booking_days BETWEEN 1 AND 7);
  END IF;
END $$;

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
  max_booking_days INTEGER := 7;
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

    max_booking_days := LEAST(
      GREATEST(COALESCE(reservation_settings.max_booking_days, 7), 1),
      7
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
