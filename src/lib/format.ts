import { formatDistanceToNowStrict } from "date-fns";
import { de } from "date-fns/locale";

// Use the team's timezone on the server and in the browser, including DST.
const timeZone = "Europe/Berlin";
const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return timeFormatter.format(new Date(value));
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
