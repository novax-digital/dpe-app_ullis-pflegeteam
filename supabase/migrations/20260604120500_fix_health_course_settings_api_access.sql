GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.health_course_settings
  TO authenticated;

NOTIFY pgrst, 'reload schema';
