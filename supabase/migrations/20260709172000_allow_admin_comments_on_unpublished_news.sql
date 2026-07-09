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
        AND (
          n.published = true
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

NOTIFY pgrst, 'reload schema';
