CREATE OR REPLACE FUNCTION public.recompute_ebike_status(_ebike_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_status public.ebike_status; has_current boolean; has_upcoming boolean;
BEGIN
  SELECT status INTO current_status FROM public.ebikes WHERE id = _ebike_id;
  IF current_status IN ('maintenance', 'unavailable') THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM public.ebike_reservations WHERE ebike_id = _ebike_id AND status = 'active' AND start_time <= now() AND end_time >= now()) INTO has_current;
  SELECT EXISTS (SELECT 1 FROM public.ebike_reservations WHERE ebike_id = _ebike_id AND status = 'active' AND start_time > now()) INTO has_upcoming;
  IF has_current THEN UPDATE public.ebikes SET status = 'in_use' WHERE id = _ebike_id AND status <> 'in_use';
  ELSIF has_upcoming THEN UPDATE public.ebikes SET status = 'reserved' WHERE id = _ebike_id AND status <> 'reserved';
  ELSE UPDATE public.ebikes SET status = 'available' WHERE id = _ebike_id AND status <> 'available';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_reservation_status_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.recompute_ebike_status(OLD.ebike_id); RETURN OLD; END IF;
  PERFORM public.recompute_ebike_status(NEW.ebike_id);
  IF TG_OP = 'UPDATE' AND NEW.ebike_id <> OLD.ebike_id THEN PERFORM public.recompute_ebike_status(OLD.ebike_id); END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS reservation_status_sync ON public.ebike_reservations;
CREATE TRIGGER reservation_status_sync AFTER INSERT OR UPDATE OR DELETE ON public.ebike_reservations
FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_status_sync();

DO $$ DECLARE r record; BEGIN FOR r IN SELECT id FROM public.ebikes LOOP PERFORM public.recompute_ebike_status(r.id); END LOOP; END $$;
