import { format, formatDistanceToNowStrict } from "date-fns";
import { de } from "date-fns/locale";

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return format(new Date(value), "dd.MM.yyyy, HH:mm", { locale: de });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return format(new Date(value), "dd.MM.yyyy", { locale: de });
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return format(new Date(value), "HH:mm", { locale: de });
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return "-";
  return formatDistanceToNowStrict(new Date(value), {
    addSuffix: true,
    locale: de,
  });
}

export function toDatetimeLocal(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const timezoneOffset = date.getTimezoneOffset();
  return new Date(date.getTime() - timezoneOffset * 60_000)
    .toISOString()
    .slice(0, 16);
}
