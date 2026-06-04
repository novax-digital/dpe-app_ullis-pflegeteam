ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS excerpt TEXT;

NOTIFY pgrst, 'reload schema';
