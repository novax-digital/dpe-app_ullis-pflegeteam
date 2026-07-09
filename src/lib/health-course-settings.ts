import type { Database } from "@/lib/database.types";

export type HealthCourseSettings =
  Database["public"]["Tables"]["health_course_settings"]["Row"];

export const DEFAULT_HEALTH_COURSE_SETTINGS: HealthCourseSettings = {
  id: "default",
  allow_same_course_multiple_registrations: true,
  categories: [],
  email_reminders_enabled: false,
  locations: [],
  max_active_registrations_per_user: 0,
  reminder_days_before: 1,
  created_at: "",
  updated_at: "",
};

export const HEALTH_COURSE_REMINDER_MAX_DAYS = 30;

export function normalizeHealthCourseOptionList(
  values: string[] | null | undefined,
) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "de"));
}

export function normalizeHealthCourseSettings(
  row: HealthCourseSettings | null | undefined,
) {
  const settings = row ?? DEFAULT_HEALTH_COURSE_SETTINGS;

  return {
    ...settings,
    allow_same_course_multiple_registrations:
      settings.allow_same_course_multiple_registrations ?? true,
    categories: normalizeHealthCourseOptionList(row?.categories),
    email_reminders_enabled: settings.email_reminders_enabled ?? false,
    locations: normalizeHealthCourseOptionList(row?.locations),
    max_active_registrations_per_user: Math.max(
      0,
      Math.floor(Number(settings.max_active_registrations_per_user ?? 0) || 0),
    ),
    reminder_days_before: Math.min(
      HEALTH_COURSE_REMINDER_MAX_DAYS,
      Math.max(
        1,
        Math.floor(Number(settings.reminder_days_before ?? 1) || 1),
      ),
    ),
  };
}
