ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'news-images',
  'news-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view news images"
  ON storage.objects;
CREATE POLICY "Public can view news images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'news-images');

DROP POLICY IF EXISTS "Admins can upload news images"
  ON storage.objects;
CREATE POLICY "Admins can upload news images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'news-images'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can update news images"
  ON storage.objects;
CREATE POLICY "Admins can update news images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'news-images'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'news-images'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete news images"
  ON storage.objects;
CREATE POLICY "Admins can delete news images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'news-images'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Authenticated view news author profiles"
  ON public.profiles;
CREATE POLICY "Authenticated view news author profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.news n
      WHERE n.author_id = profiles.id
        AND (
          n.published = true
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );
