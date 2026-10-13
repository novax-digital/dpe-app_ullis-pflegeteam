-- Admin-managed roles --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_roles (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  base_role public.app_role NOT NULL DEFAULT 'employee',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_roles_key_format CHECK (key ~ '^[a-z0-9][a-z0-9-]{1,49}$')
);

INSERT INTO public.app_roles (key, label, base_role, is_system)
VALUES
  ('admin', 'Administration', 'admin', true),
  ('employee', 'Mitarbeitende:r', 'employee', true),
  ('physiotherapy', 'Physiopraxis', 'physiotherapy', true)
ON CONFLICT (key) DO UPDATE
SET
  label = EXCLUDED.label,
  base_role = EXCLUDED.base_role,
  is_system = true;

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE TEXT USING role::TEXT;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_fkey;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_fkey
  FOREIGN KEY (role) REFERENCES public.app_roles(key)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.has_role(
  _user_id UUID,
  _role public.app_role
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.app_roles ar ON ar.key = ur.role
    WHERE ur.user_id = _user_id
      AND (
        ur.role = _role::TEXT
        OR ar.base_role = _role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(
  _user_id UUID,
  _role TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.app_roles ar ON ar.key = ur.role
    WHERE ur.user_id = _user_id
      AND (
        ur.role = _role
        OR ar.base_role::TEXT = _role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(
  _user_id UUID,
  _roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.app_roles ar ON ar.key = ur.role
    WHERE ur.user_id = _user_id
      AND (
        ur.role = ANY(_roles)
        OR ar.base_role::TEXT = ANY(_roles)
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(UUID, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, position)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'position', '')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'employee');

  RETURN new;
END;
$$;

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view app roles"
  ON public.app_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert app roles"
  ON public.app_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update app roles"
  ON public.app_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete app roles"
  ON public.app_roles FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND is_system = false
  );

DROP TRIGGER IF EXISTS update_app_roles_updated_at ON public.app_roles;
CREATE TRIGGER update_app_roles_updated_at
  BEFORE UPDATE ON public.app_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admin-created navigation pages --------------------------------------------

CREATE TABLE IF NOT EXISTS public.custom_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  summary TEXT,
  content TEXT NOT NULL DEFAULT '',
  visible_to_roles TEXT[] NOT NULL DEFAULT '{}',
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_page_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.custom_pages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (btrim(file_name) <> ''),
  file_path TEXT NOT NULL UNIQUE,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_pages_navigation_idx
  ON public.custom_pages (published, sort_order, title);
CREATE INDEX IF NOT EXISTS custom_page_files_page_id_idx
  ON public.custom_page_files (page_id, created_at);

ALTER TABLE public.custom_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_page_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Visible custom pages can be viewed"
  ON public.custom_pages FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      published = true
      AND (
        cardinality(visible_to_roles) = 0
        OR public.has_any_role(auth.uid(), visible_to_roles)
      )
    )
  );

CREATE POLICY "Admins can insert custom pages"
  ON public.custom_pages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update custom pages"
  ON public.custom_pages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete custom pages"
  ON public.custom_pages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Visible custom page files can be viewed"
  ON public.custom_page_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_pages page
      WHERE page.id = custom_page_files.page_id
    )
  );

CREATE POLICY "Admins can insert custom page files"
  ON public.custom_page_files FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete custom page files"
  ON public.custom_page_files FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_custom_pages_updated_at ON public.custom_pages;
CREATE TRIGGER update_custom_pages_updated_at
  BEFORE UPDATE ON public.custom_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'custom-page-files',
  'custom-page-files',
  false,
  20971520,
  ARRAY['application/pdf']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Admins can upload custom page files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'custom-page-files'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Visible users can download custom page files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'custom-page-files'
    AND EXISTS (
      SELECT 1
      FROM public.custom_pages page
      WHERE page.id::TEXT = (storage.foldername(name))[1]
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            page.published = true
            AND (
              cardinality(page.visible_to_roles) = 0
              OR public.has_any_role(auth.uid(), page.visible_to_roles)
            )
          )
        )
    )
  );

CREATE POLICY "Admins can update custom page files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'custom-page-files'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'custom-page-files'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can delete custom page files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'custom-page-files'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Role-targeted news ---------------------------------------------------------

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS audience_roles TEXT[] NOT NULL DEFAULT '{}';

-- Upload images directly from the browser. This avoids serverless request-body
-- limits for modern phone photos and no longer depends on the service-role key.
DROP POLICY IF EXISTS "Authenticated can upload news images"
  ON storage.objects;
CREATE POLICY "Authenticated can upload news images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'news-images'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated can view published news" ON public.news;
CREATE POLICY "Authenticated can view published news"
  ON public.news FOR SELECT
  TO authenticated
  USING (
    published = true
    AND (
      cardinality(audience_roles) = 0
      OR public.has_any_role(auth.uid(), audience_roles)
    )
  );

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
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            n.published = true
            AND (
              cardinality(n.audience_roles) = 0
              OR public.has_any_role(auth.uid(), n.audience_roles)
            )
          )
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
        AND (
          cardinality(n.audience_roles) = 0
          OR public.has_any_role(auth.uid(), n.audience_roles)
        )
    )
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
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            n.published = true
            AND (
              cardinality(n.audience_roles) = 0
              OR public.has_any_role(auth.uid(), n.audience_roles)
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated view news comment author profiles"
  ON public.profiles;
CREATE POLICY "Authenticated view news comment author profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.news_comments c
      JOIN public.news n ON n.id = c.news_id
      WHERE c.author_id = profiles.id
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            n.published = true
            AND (
              cardinality(n.audience_roles) = 0
              OR public.has_any_role(auth.uid(), n.audience_roles)
            )
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
