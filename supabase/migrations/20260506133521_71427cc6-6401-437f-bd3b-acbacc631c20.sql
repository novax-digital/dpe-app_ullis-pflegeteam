
-- Enums
CREATE TYPE public.ebike_status AS ENUM ('available', 'reserved', 'in_use', 'maintenance', 'unavailable');
CREATE TYPE public.reservation_status AS ENUM ('active', 'completed', 'cancelled');

-- ebikes table
CREATE TABLE public.ebikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  model TEXT,
  frame_size TEXT,
  location TEXT,
  status public.ebike_status NOT NULL DEFAULT 'available',
  image_url TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ebikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ebikes - select" ON public.ebikes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ebikes - insert" ON public.ebikes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ebikes - update" ON public.ebikes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ebikes - delete" ON public.ebikes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees view active ebikes" ON public.ebikes FOR SELECT TO authenticated
  USING (active = true AND public.has_role(auth.uid(), 'employee'));

CREATE TRIGGER update_ebikes_updated_at
  BEFORE UPDATE ON public.ebikes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ebike_reservations table
CREATE TABLE public.ebike_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ebike_id UUID NOT NULL REFERENCES public.ebikes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'active',
  purpose TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ebike_reservations_ebike ON public.ebike_reservations(ebike_id, start_time, end_time);
CREATE INDEX idx_ebike_reservations_user ON public.ebike_reservations(user_id);

ALTER TABLE public.ebike_reservations ENABLE ROW LEVEL SECURITY;

-- Admins
CREATE POLICY "Admins view all reservations" ON public.ebike_reservations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert reservations" ON public.ebike_reservations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update reservations" ON public.ebike_reservations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete reservations" ON public.ebike_reservations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Employees
CREATE POLICY "Employees view own reservations" ON public.ebike_reservations FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'employee'));
CREATE POLICY "Employees create own reservations" ON public.ebike_reservations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'employee'));
CREATE POLICY "Employees update own reservations" ON public.ebike_reservations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'employee'));

CREATE TRIGGER update_ebike_reservations_updated_at
  BEFORE UPDATE ON public.ebike_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Conflict prevention via trigger
CREATE OR REPLACE FUNCTION public.check_ebike_reservation_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;

  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.ebike_reservations r
    WHERE r.ebike_id = NEW.ebike_id
      AND r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND r.status = 'active'
      AND r.start_time < NEW.end_time
      AND r.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Dieses E-Bike ist im gewählten Zeitraum bereits reserviert';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ebike_reservation_conflict_check
  BEFORE INSERT OR UPDATE ON public.ebike_reservations
  FOR EACH ROW EXECUTE FUNCTION public.check_ebike_reservation_conflict();
