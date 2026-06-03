
-- 1) Foreign Key neu mit CASCADE setzen
ALTER TABLE public.ebike_reservations
  DROP CONSTRAINT IF EXISTS ebike_reservations_ebike_id_fkey;

DELETE FROM public.ebike_reservations r
WHERE NOT EXISTS (SELECT 1 FROM public.ebikes b WHERE b.id = r.ebike_id);

ALTER TABLE public.ebike_reservations
  ADD CONSTRAINT ebike_reservations_ebike_id_fkey
  FOREIGN KEY (ebike_id) REFERENCES public.ebikes(id) ON DELETE CASCADE;

-- 2) Trigger erweitern
CREATE OR REPLACE FUNCTION public.check_ebike_reservation_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;

  IF NEW.status = 'active' THEN
    IF (TG_OP = 'INSERT' OR NEW.start_time IS DISTINCT FROM OLD.start_time)
       AND NEW.start_time < (now() - interval '5 minutes') THEN
      RAISE EXCEPTION 'Startzeit darf nicht in der Vergangenheit liegen';
    END IF;

    IF (NEW.end_time - NEW.start_time) > interval '14 days' THEN
      RAISE EXCEPTION 'Maximale Reservierungsdauer beträgt 14 Tage';
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
$function$;

DROP TRIGGER IF EXISTS trg_check_ebike_reservation_conflict ON public.ebike_reservations;
CREATE TRIGGER trg_check_ebike_reservation_conflict
BEFORE INSERT OR UPDATE ON public.ebike_reservations
FOR EACH ROW EXECUTE FUNCTION public.check_ebike_reservation_conflict();

DROP TRIGGER IF EXISTS trg_reservation_status_sync ON public.ebike_reservations;
CREATE TRIGGER trg_reservation_status_sync
AFTER INSERT OR UPDATE OR DELETE ON public.ebike_reservations
FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_status_sync();

-- 3) Auto-Complete Funktion + pg_cron Job
CREATE OR REPLACE FUNCTION public.complete_expired_ebike_reservations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.ebike_reservations
  SET status = 'completed'
  WHERE status = 'active' AND end_time < now();
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('complete-expired-ebike-reservations');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'complete-expired-ebike-reservations',
  '*/15 * * * *',
  $$SELECT public.complete_expired_ebike_reservations();$$
);

-- 4) Realtime
ALTER TABLE public.ebike_reservations REPLICA IDENTITY FULL;
ALTER TABLE public.ebikes REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ebike_reservations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ebikes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
