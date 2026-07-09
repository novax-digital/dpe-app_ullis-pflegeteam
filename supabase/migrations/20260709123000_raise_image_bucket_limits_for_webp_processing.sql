UPDATE storage.buckets
SET
  file_size_limit = 12582912,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
WHERE id IN ('news-images', 'course-images', 'ebike-images');

NOTIFY pgrst, 'reload schema';
