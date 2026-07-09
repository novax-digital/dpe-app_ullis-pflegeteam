ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.calendar_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  email_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_days_before INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_settings_reminder_days_before_range'
  ) THEN
    ALTER TABLE public.calendar_settings
      ADD CONSTRAINT calendar_settings_reminder_days_before_range
      CHECK (reminder_days_before BETWEEN 1 AND 30);
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated view calendar settings"
  ON public.calendar_settings;
CREATE POLICY "Authenticated view calendar settings"
  ON public.calendar_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins insert calendar settings"
  ON public.calendar_settings;
CREATE POLICY "Admins insert calendar settings"
  ON public.calendar_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update calendar settings"
  ON public.calendar_settings;
CREATE POLICY "Admins update calendar settings"
  ON public.calendar_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete calendar settings"
  ON public.calendar_settings;
CREATE POLICY "Admins delete calendar settings"
  ON public.calendar_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_calendar_settings_updated_at
  ON public.calendar_settings;
CREATE TRIGGER update_calendar_settings_updated_at
  BEFORE UPDATE ON public.calendar_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.calendar_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.calendar_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
    ADD TABLE public.calendar_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
