INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'ebike-images',
  'ebike-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Public can view ebike images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ebike-images');

CREATE POLICY "Admins can upload ebike images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ebike-images'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can update ebike images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ebike-images'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'ebike-images'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete ebike images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ebike-images'
    AND public.has_role(auth.uid(), 'admin')
  );
