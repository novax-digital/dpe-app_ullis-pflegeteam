
-- Stop persisting transient "in_use" state; derive it dynamically from reservations.
CREATE OR REPLACE FUNCTION public.recompute_ebike_status(_ebike_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE current_status public.ebike_status;
BEGIN
  SELECT status INTO current_status FROM public.ebikes WHERE id = _ebike_id;
  -- Never overwrite admin-controlled states
  IF current_status IN ('maintenance', 'unavailable') THEN RETURN; END IF;
  -- Always reset to 'available'; "in_use" is derived in the UI from active reservations
  UPDATE public.ebikes SET status = 'available' WHERE id = _ebike_id AND status <> 'available';
END;
$function$;

-- One-off cleanup: reset any bikes currently stuck on in_use
UPDATE public.ebikes SET status = 'available' WHERE status = 'in_use';
