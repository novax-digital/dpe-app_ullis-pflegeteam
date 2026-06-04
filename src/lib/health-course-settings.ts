import type { Database } from "@/lib/database.types";

export type HealthCourseSettings =
  Database["public"]["Tables"]["health_course_settings"]["Row"];

export const DEFAULT_HEALTH_COURSE_SETTINGS: HealthCourseSettings = {
  id: "default",
  allow_same_course_multiple_registrations: true,
  categories: [],
  locations: [],
  max_active_registrations_per_user: 0,
  created_at: "",
  updated_at: "",
};

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
    locations: normalizeHealthCourseOptionList(row?.locations),
    max_active_registrations_per_user: Math.max(
      0,
      Math.floor(Number(settings.max_active_registrations_per_user ?? 0) || 0),
    ),
  };
}
