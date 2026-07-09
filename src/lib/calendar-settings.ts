import type { Database } from "@/lib/database.types";

export type CalendarSettings =
  Database["public"]["Tables"]["calendar_settings"]["Row"];

export const CALENDAR_REMINDER_MAX_DAYS = 30;

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  id: "default",
  email_reminders_enabled: false,
  reminder_days_before: 1,
  created_at: "",
  updated_at: "",
};

export function normalizeCalendarSettings(
  row: CalendarSettings | null | undefined,
) {
  const settings = row ?? DEFAULT_CALENDAR_SETTINGS;

  return {
    ...settings,
    email_reminders_enabled: settings.email_reminders_enabled ?? false,
    reminder_days_before: Math.min(
      CALENDAR_REMINDER_MAX_DAYS,
      Math.max(
        1,
        Math.floor(Number(settings.reminder_days_before ?? 1) || 1),
      ),
    ),
  };
}
