CREATE TABLE IF NOT EXISTS public.health_course_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  categories TEXT[] NOT NULL DEFAULT '{}',
  locations TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_course_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view health course settings"
  ON public.health_course_settings;
CREATE POLICY "Authenticated view health course settings"
  ON public.health_course_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins insert health course settings"
  ON public.health_course_settings;
CREATE POLICY "Admins insert health course settings"
  ON public.health_course_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update health course settings"
  ON public.health_course_settings;
CREATE POLICY "Admins update health course settings"
  ON public.health_course_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete health course settings"
  ON public.health_course_settings;
CREATE POLICY "Admins delete health course settings"
  ON public.health_course_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_health_course_settings_updated_at
  ON public.health_course_settings;
CREATE TRIGGER update_health_course_settings_updated_at
  BEFORE UPDATE ON public.health_course_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

WITH existing_values AS (
  SELECT
    COALESCE(
      array_agg(DISTINCT btrim(category) ORDER BY btrim(category))
        FILTER (WHERE category IS NOT NULL AND btrim(category) <> ''),
      '{}'::text[]
    ) AS categories,
    COALESCE(
      array_agg(DISTINCT btrim(location) ORDER BY btrim(location))
        FILTER (WHERE location IS NOT NULL AND btrim(location) <> ''),
      '{}'::text[]
    ) AS locations
  FROM public.health_courses
)
INSERT INTO public.health_course_settings (id, categories, locations)
SELECT 'default', categories, locations
FROM existing_values
ON CONFLICT (id) DO UPDATE
SET
  categories = ARRAY(
    SELECT DISTINCT item
    FROM unnest(public.health_course_settings.categories || EXCLUDED.categories) item
    WHERE btrim(item) <> ''
    ORDER BY item
  ),
  locations = ARRAY(
    SELECT DISTINCT item
    FROM unnest(public.health_course_settings.locations || EXCLUDED.locations) item
    WHERE btrim(item) <> ''
    ORDER BY item
  );

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'course-images',
  'course-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view course images"
  ON storage.objects;
CREATE POLICY "Public can view course images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'course-images');

DROP POLICY IF EXISTS "Course managers can upload course images"
  ON storage.objects;
CREATE POLICY "Course managers can upload course images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-images'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'physiotherapy')
    )
  );

DROP POLICY IF EXISTS "Course managers can update course images"
  ON storage.objects;
CREATE POLICY "Course managers can update course images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'course-images'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'physiotherapy')
    )
  )
  WITH CHECK (
    bucket_id = 'course-images'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'physiotherapy')
    )
  );

DROP POLICY IF EXISTS "Course managers can delete course images"
  ON storage.objects;
CREATE POLICY "Course managers can delete course images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'course-images'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'physiotherapy')
    )
  );
