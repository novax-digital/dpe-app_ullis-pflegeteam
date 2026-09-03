-- All authenticated portal users may see the total team size on the pinboard,
-- but should not gain access to other employees' profile records.
CREATE OR REPLACE FUNCTION public.get_employee_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.profiles
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_employee_count()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_count()
  TO authenticated;

NOTIFY pgrst, 'reload schema';
