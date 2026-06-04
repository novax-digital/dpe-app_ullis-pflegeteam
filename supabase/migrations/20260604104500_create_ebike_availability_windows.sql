CREATE TABLE IF NOT EXISTS public.ebike_availability_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INTEGER NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  active BOOLEAN NOT NULL DEFAULT true,
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);

ALTER TABLE public.ebike_availability_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view ebike availability"
  ON public.ebike_availability_windows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins insert ebike availability"
  ON public.ebike_availability_windows FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update ebike availability"
  ON public.ebike_availability_windows FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete ebike availability"
  ON public.ebike_availability_windows FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ebike_availability_windows_updated_at
  BEFORE UPDATE ON public.ebike_availability_windows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ebike_availability_windows (
  day_of_week,
  active,
  start_time,
  end_time
)
VALUES
  (0, false, '08:00', '18:00'),
  (1, true, '08:00', '18:00'),
  (2, true, '08:00', '18:00'),
  (3, true, '08:00', '18:00'),
  (4, true, '08:00', '18:00'),
  (5, true, '08:00', '18:00'),
  (6, false, '08:00', '18:00')
ON CONFLICT (day_of_week) DO NOTHING;

CREATE POLICY "Employees view active ebike reservation schedule"
  ON public.ebike_reservations FOR SELECT
  TO authenticated
  USING (status = 'active' AND public.has_role(auth.uid(), 'employee'));

CREATE OR REPLACE FUNCTION public.check_ebike_reservation_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_start TIMESTAMP;
  local_end TIMESTAMP;
  availability RECORD;
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
