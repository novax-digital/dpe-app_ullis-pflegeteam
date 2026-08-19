-- Keep the original publication time stable, including after edits or
-- unpublishing/republishing a message.
UPDATE public.news
SET published_at = created_at
WHERE published = true
  AND published_at IS NULL;

CREATE OR REPLACE FUNCTION public.preserve_news_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.published = true THEN
      NEW.published_at = COALESCE(NEW.published_at, NEW.created_at, now());
    ELSE
      NEW.published_at = NULL;
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.published_at IS NOT NULL THEN
    NEW.published_at = OLD.published_at;
  ELSIF NEW.published = true THEN
    NEW.published_at = now();
  ELSE
    NEW.published_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_news_published_at
  ON public.news;
CREATE TRIGGER preserve_news_published_at
  BEFORE INSERT OR UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.preserve_news_published_at();

ALTER TABLE public.news
  ADD CONSTRAINT news_published_at_required_when_published
  CHECK (published = false OR published_at IS NOT NULL);

-- Employees need the total occupancy, but must not gain access to other
-- employees' registration records. Return only one aggregate per course.
CREATE OR REPLACE FUNCTION public.get_health_course_registration_counts()
RETURNS TABLE (
  course_id UUID,
  registration_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    registration.course_id,
    COUNT(*)::INTEGER AS registration_count
  FROM public.course_registrations AS registration
  WHERE registration.status = 'registered'
    AND auth.uid() IS NOT NULL
  GROUP BY registration.course_id;
$$;

REVOKE ALL ON FUNCTION public.get_health_course_registration_counts()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_health_course_registration_counts()
  TO authenticated;

NOTIFY pgrst, 'reload schema';
