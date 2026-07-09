CREATE TABLE IF NOT EXISTS public.news_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (btrim(content) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view comments for visible news"
  ON public.news_comments;
CREATE POLICY "Authenticated view comments for visible news"
  ON public.news_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.news n
      WHERE n.id = news_comments.news_id
        AND (
          n.published = true
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated insert own comments"
  ON public.news_comments;
CREATE POLICY "Authenticated insert own comments"
  ON public.news_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.news n
      WHERE n.id = news_comments.news_id
        AND n.published = true
    )
  );

DROP POLICY IF EXISTS "Authors update own comments"
  ON public.news_comments;
CREATE POLICY "Authors update own comments"
  ON public.news_comments FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Authors delete own comments"
  ON public.news_comments;
CREATE POLICY "Authors delete own comments"
  ON public.news_comments FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

DROP TRIGGER IF EXISTS update_news_comments_updated_at
  ON public.news_comments;
CREATE TRIGGER update_news_comments_updated_at
  BEFORE UPDATE ON public.news_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.news_comments REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
    ADD TABLE public.news_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
