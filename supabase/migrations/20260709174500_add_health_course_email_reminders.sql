ALTER TABLE public.health_courses
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

ALTER TABLE public.health_course_settings
  ADD COLUMN IF NOT EXISTS email_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'health_course_settings_reminder_days_before_range'
  ) THEN
    ALTER TABLE public.health_course_settings
      ADD CONSTRAINT health_course_settings_reminder_days_before_range
      CHECK (reminder_days_before BETWEEN 1 AND 30);
  END IF;
END $$;

INSERT INTO public.health_course_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
