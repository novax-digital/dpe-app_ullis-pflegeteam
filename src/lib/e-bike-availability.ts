import type { Database } from "@/lib/database.types";

export type EBikeAvailabilityWindow =
  Database["public"]["Tables"]["ebike_availability_windows"]["Row"];

export const WEEKDAY_LABELS = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

export const DEFAULT_EBIKE_AVAILABILITY: EBikeAvailabilityWindow[] =
  WEEKDAY_LABELS.map((_, dayOfWeek) => ({
    id: `default-${dayOfWeek}`,
    day_of_week: dayOfWeek,
    active: dayOfWeek >= 1 && dayOfWeek <= 5,
    start_time: "08:00:00",
    end_time: "18:00:00",
    created_at: "",
    updated_at: "",
  }));

export function normalizeEBikeAvailability(
  rows: EBikeAvailabilityWindow[] | null | undefined,
) {
  return WEEKDAY_LABELS.map((_, dayOfWeek) => {
    const row = rows?.find((item) => item.day_of_week === dayOfWeek);
    return row ?? DEFAULT_EBIKE_AVAILABILITY[dayOfWeek];
  });
}

export function shortTime(value: string) {
  return value.slice(0, 5);
}
