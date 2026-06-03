-- Update recompute function: don't use 'reserved' status anymore
CREATE OR REPLACE FUNCTION public.recompute_ebike_status(_ebike_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE current_status public.ebike_status; has_current boolean;
BEGIN
  SELECT status INTO current_status FROM public.ebikes WHERE id = _ebike_id;
  IF current_status IN ('maintenance', 'unavailable') THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ebike_reservations
    WHERE ebike_id = _ebike_id
      AND status = 'active'
      AND start_time <= now()
      AND end_time >= now()
  ) INTO has_current;

  IF has_current THEN
    UPDATE public.ebikes SET status = 'in_use' WHERE id = _ebike_id AND status <> 'in_use';
  ELSE
    UPDATE public.ebikes SET status = 'available' WHERE id = _ebike_id AND status <> 'available';
  END IF;
END;
$function$;

-- Reset any bikes currently flagged 'reserved' back to 'available' (unless currently in use)
UPDATE public.ebikes SET status = 'available'
WHERE status = 'reserved'
  AND NOT EXISTS (
    SELECT 1 FROM public.ebike_reservations r
    WHERE r.ebike_id = ebikes.id AND r.status = 'active'
      AND r.start_time <= now() AND r.end_time >= now()
  );

UPDATE public.ebikes SET status = 'in_use'
WHERE status = 'reserved'
  AND EXISTS (
    SELECT 1 FROM public.ebike_reservations r
    WHERE r.ebike_id = ebikes.id AND r.status = 'active'
      AND r.start_time <= now() AND r.end_time >= now()
  );