import type { Database } from "@/lib/database.types";

export type NewsSettings =
  Database["public"]["Tables"]["news_settings"]["Row"];

export const DEFAULT_NEWS_SETTINGS: NewsSettings = {
  id: "default",
  categories: [],
  created_at: "",
  updated_at: "",
};

export function normalizeNewsCategoryList(
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

export function normalizeNewsSettings(row: NewsSettings | null | undefined) {
  const settings = row ?? DEFAULT_NEWS_SETTINGS;

  return {
    ...settings,
    categories: normalizeNewsCategoryList(row?.categories),
  };
}
