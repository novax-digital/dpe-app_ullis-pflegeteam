CREATE TABLE IF NOT EXISTS public.app_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL CHECK (btrim(label) <> '' AND char_length(btrim(label)) <= 80),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_positions_label_unique_idx
  ON public.app_positions (lower(btrim(label)));
CREATE INDEX IF NOT EXISTS app_positions_sort_idx
  ON public.app_positions (sort_order, label);

INSERT INTO public.app_positions (label, sort_order)
VALUES
  ('Pflegedienstleitung', 0),
  ('Stellv. Pflegedienstleitung', 1),
  ('Pflegefachkraft', 2),
  ('Pflegehelfer:in', 3),
  ('Verwaltung', 4),
  ('Auszubildende:r', 5),
  ('Sonstige', 6)
ON CONFLICT DO NOTHING;

INSERT INTO public.app_positions (label, sort_order)
SELECT
  existing.position,
  100 + row_number() OVER (ORDER BY lower(existing.position))
FROM (
  SELECT DISTINCT btrim(position) AS position
  FROM public.profiles
  WHERE position IS NOT NULL AND btrim(position) <> ''
) AS existing
WHERE NOT EXISTS (
  SELECT 1
  FROM public.app_positions configured
  WHERE lower(btrim(configured.label)) = lower(existing.position)
)
ON CONFLICT DO NOTHING;

ALTER TABLE public.app_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view positions"
  ON public.app_positions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert positions"
  ON public.app_positions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update positions"
  ON public.app_positions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete positions"
  ON public.app_positions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_app_positions_updated_at ON public.app_positions;
CREATE TRIGGER update_app_positions_updated_at
  BEFORE UPDATE ON public.app_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_profile_position_labels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.label IS DISTINCT FROM OLD.label THEN
    UPDATE public.profiles
    SET position = NEW.label
    WHERE lower(btrim(position)) = lower(btrim(OLD.label));
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET position = NULL
    WHERE lower(btrim(position)) = lower(btrim(OLD.label));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_position_labels ON public.app_positions;
CREATE TRIGGER sync_profile_position_labels
  AFTER UPDATE OF label OR DELETE ON public.app_positions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_position_labels();
