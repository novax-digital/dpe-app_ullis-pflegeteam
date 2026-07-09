"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  Bell,
  Bike,
  CalendarDays,
  HeartPulse,
  ListChecks,
  Loader2,
  MapPin,
  Newspaper,
  Plus,
  Save,
  ShieldCheck,
  Tags,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
  Textarea,
} from "@/components/ui";
import {
  normalizeEBikeAvailability,
  shortTime,
  WEEKDAY_LABELS,
  type EBikeAvailabilityWindow,
} from "@/lib/e-bike-availability";
import {
  EBIKE_RESERVATION_MAX_BOOKING_DAYS,
  normalizeEBikeReservationSettings,
  type EBikeReservationSettings,
} from "@/lib/e-bike-reservation-settings";
import {
  HEALTH_COURSE_REMINDER_MAX_DAYS,
  normalizeHealthCourseOptionList,
  normalizeHealthCourseSettings,
  type HealthCourseSettings,
} from "@/lib/health-course-settings";
import {
  normalizeNewsCategoryList,
  normalizeNewsSettings,
  type NewsSettings,
} from "@/lib/news-settings";
import {
  CALENDAR_REMINDER_MAX_DAYS,
  normalizeCalendarSettings,
  type CalendarSettings,
} from "@/lib/calendar-settings";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export type SettingsMode = "e-bikes" | "messages" | "calendar" | "courses";

const settingsItems = [
  {
    href: "/settings/e-bikes",
    label: "E-Bikes",
    icon: Bike,
    adminOnly: true,
  },
  {
    href: "/settings/nachrichten",
    label: "Nachrichten",
    icon: Newspaper,
    adminOnly: true,
  },
  {
    href: "/settings/kalender",
    label: "Kalender",
    icon: CalendarDays,
    adminOnly: true,
  },
  {
    href: "/settings/kurse",
    label: "Kurse",
    icon: HeartPulse,
    adminOnly: true,
  },
];

function SettingsSectionNav({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const visibleItems = settingsItems.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  return (
    <div className="inline-flex rounded-md border border-border bg-card p-1">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function settingsErrorMessage(message: string) {
  const lower = message.toLowerCase();

  if (
    lower.includes("schema cache") ||
    lower.includes("could not find the table")
  ) {
    return "Die Datenbank-Einstellungen sind noch nicht vollständig eingerichtet. Bitte die neuesten Supabase-Migrationen ausführen.";
  }

  return message;
}

export function SettingsPage({
  mode,
  isAdmin,
  initialEBikeAvailability,
  initialEBikeReservationSettings,
  initialHealthCourseSettings,
  initialNewsSettings,
  initialCalendarSettings,
}: {
  mode: SettingsMode;
  isAdmin: boolean;
  initialEBikeAvailability?: EBikeAvailabilityWindow[];
  initialEBikeReservationSettings?: EBikeReservationSettings;
  initialHealthCourseSettings?: HealthCourseSettings;
  initialNewsSettings?: NewsSettings;
  initialCalendarSettings?: CalendarSettings;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const normalizedReservationSettings = normalizeEBikeReservationSettings(
    initialEBikeReservationSettings ?? null,
  );
  const normalizedHealthCourseSettings = normalizeHealthCourseSettings(
    initialHealthCourseSettings ?? null,
  );
  const normalizedNewsSettings = normalizeNewsSettings(
    initialNewsSettings ?? null,
  );
  const normalizedCalendarSettings = normalizeCalendarSettings(
    initialCalendarSettings ?? null,
  );
  const [availability, setAvailability] = useState(() =>
    normalizeEBikeAvailability(initialEBikeAvailability ?? []),
  );
  const [maxBookingDays, setMaxBookingDays] = useState(
    normalizedReservationSettings.max_booking_days,
  );
  const [safetyConfirmationEnabled, setSafetyConfirmationEnabled] = useState(
    normalizedReservationSettings.safety_confirmation_enabled,
  );
  const [safetyConfirmationText, setSafetyConfirmationText] = useState(
    normalizedReservationSettings.safety_confirmation_text,
  );
  const [courseLocations, setCourseLocations] = useState(() =>
    normalizedHealthCourseSettings.locations.length > 0
      ? normalizedHealthCourseSettings.locations
      : [""],
  );
  const [courseCategories, setCourseCategories] = useState(() =>
    normalizedHealthCourseSettings.categories.length > 0
      ? normalizedHealthCourseSettings.categories
      : [""],
  );
  const [messageCategories, setMessageCategories] = useState(() =>
    normalizedNewsSettings.categories.length > 0
      ? normalizedNewsSettings.categories
      : [""],
  );
  const [calendarEmailRemindersEnabled, setCalendarEmailRemindersEnabled] =
    useState(normalizedCalendarSettings.email_reminders_enabled);
  const [calendarReminderDaysBefore, setCalendarReminderDaysBefore] = useState(
    normalizedCalendarSettings.reminder_days_before,
  );
  const [
    allowSameCourseMultipleRegistrations,
    setAllowSameCourseMultipleRegistrations,
  ] = useState(
    normalizedHealthCourseSettings.allow_same_course_multiple_registrations,
  );
  const [
    maxActiveCourseRegistrations,
    setMaxActiveCourseRegistrations,
  ] = useState(
    normalizedHealthCourseSettings.max_active_registrations_per_user,
  );
  const [courseEmailRemindersEnabled, setCourseEmailRemindersEnabled] =
    useState(normalizedHealthCourseSettings.email_reminders_enabled);
  const [courseReminderDaysBefore, setCourseReminderDaysBefore] = useState(
    normalizedHealthCourseSettings.reminder_days_before,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookingRulesLoading, setBookingRulesLoading] = useState(false);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [messageSettingsLoading, setMessageSettingsLoading] = useState(false);
  const [calendarSettingsLoading, setCalendarSettingsLoading] = useState(false);
  const [courseSettingsLoading, setCourseSettingsLoading] = useState(false);

  function updateAvailability(
    dayOfWeek: number,
    patch: Partial<EBikeAvailabilityWindow>,
  ) {
    setAvailability((current) =>
      current.map((item) =>
        item.day_of_week === dayOfWeek ? { ...item, ...patch } : item,
      ),
    );
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    const invalidWindow = availability.find(
      (item) => item.active && item.start_time >= item.end_time,
    );

    if (invalidWindow) {
      setMessage(
        `${WEEKDAY_LABELS[invalidWindow.day_of_week]}: Start muss vor Ende liegen.`,
      );
      return;
    }

    setAvailabilityLoading(true);

    const { error } = await supabase.from("ebike_availability_windows").upsert(
      availability.map((item) => ({
        day_of_week: item.day_of_week,
        active: item.active,
        start_time: shortTime(item.start_time),
        end_time: shortTime(item.end_time),
      })),
      { onConflict: "day_of_week" },
    );

    setAvailabilityLoading(false);

    if (error) {
      setMessage(settingsErrorMessage(error.message));
      return;
    }

    setSuccess("E-Bike-Zeiten gespeichert.");
  }

  async function saveBookingRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    const normalizedMaxBookingDays = Math.max(
      1,
      Math.min(
        EBIKE_RESERVATION_MAX_BOOKING_DAYS,
        Math.floor(Number(maxBookingDays) || 1),
      ),
    );

    setBookingRulesLoading(true);

    const { error } = await supabase.from("ebike_reservation_settings").upsert(
      {
        id: "default",
        max_booking_days: normalizedMaxBookingDays,
        safety_confirmation_enabled: safetyConfirmationEnabled,
        safety_confirmation_text: safetyConfirmationText.trim(),
      },
      { onConflict: "id" },
    );

    setBookingRulesLoading(false);

    if (error) {
      setMessage(settingsErrorMessage(error.message));
      return;
    }

    setMaxBookingDays(normalizedMaxBookingDays);
    setSuccess("E-Bike-Buchungsregeln gespeichert.");
  }

  async function saveSafetyConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    if (
      safetyConfirmationEnabled &&
      safetyConfirmationText.trim().length === 0
    ) {
      setMessage("Bitte einen Hinweistext für die Bestätigung eintragen.");
      return;
    }

    setSafetyLoading(true);

    const { error } = await supabase.from("ebike_reservation_settings").upsert(
      {
        id: "default",
        max_booking_days: Math.max(
          1,
          Math.min(
            EBIKE_RESERVATION_MAX_BOOKING_DAYS,
            Math.floor(Number(maxBookingDays) || 1),
          ),
        ),
        safety_confirmation_enabled: safetyConfirmationEnabled,
        safety_confirmation_text: safetyConfirmationText.trim(),
      },
      { onConflict: "id" },
    );

    setSafetyLoading(false);

    if (error) {
      setMessage(settingsErrorMessage(error.message));
      return;
    }

    setSuccess("E-Bike-Sicherheitsbestätigung gespeichert.");
  }

  function updateCourseLocation(index: number, value: string) {
    setCourseLocations((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }

  function removeCourseLocation(index: number) {
    setCourseLocations((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [""];
    });
  }

  function updateCourseCategory(index: number, value: string) {
    setCourseCategories((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }

  function removeCourseCategory(index: number) {
    setCourseCategories((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [""];
    });
  }

  function updateMessageCategory(index: number, value: string) {
    setMessageCategories((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }

  function removeMessageCategory(index: number) {
    setMessageCategories((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [""];
    });
  }

  async function saveMessageSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    const normalizedCategories =
      normalizeNewsCategoryList(messageCategories);

    setMessageSettingsLoading(true);

    const { error } = await supabase.from("news_settings").upsert(
      {
        id: "default",
        categories: normalizedCategories,
      },
      { onConflict: "id" },
    );

    setMessageSettingsLoading(false);

    if (error) {
      setMessage(settingsErrorMessage(error.message));
      return;
    }

    setMessageCategories(
      normalizedCategories.length > 0 ? normalizedCategories : [""],
    );
    setSuccess("Nachrichten-Einstellungen gespeichert.");
  }

  async function saveCalendarSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    const normalizedReminderDaysBefore = Math.min(
      CALENDAR_REMINDER_MAX_DAYS,
      Math.max(1, Math.floor(Number(calendarReminderDaysBefore) || 1)),
    );

    setCalendarSettingsLoading(true);

    const { error } = await supabase.from("calendar_settings").upsert(
      {
        id: "default",
        email_reminders_enabled: calendarEmailRemindersEnabled,
        reminder_days_before: normalizedReminderDaysBefore,
      },
      { onConflict: "id" },
    );

    setCalendarSettingsLoading(false);

    if (error) {
      setMessage(settingsErrorMessage(error.message));
      return;
    }

    setCalendarReminderDaysBefore(normalizedReminderDaysBefore);
    setSuccess("Kalender-Einstellungen gespeichert.");
  }

  async function saveHealthCourseSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    const normalizedLocations =
      normalizeHealthCourseOptionList(courseLocations);
    const normalizedCategories =
      normalizeHealthCourseOptionList(courseCategories);
    const normalizedReminderDaysBefore = Math.min(
      HEALTH_COURSE_REMINDER_MAX_DAYS,
      Math.max(1, Math.floor(Number(courseReminderDaysBefore) || 1)),
    );

    setCourseSettingsLoading(true);

    const { error } = await supabase.from("health_course_settings").upsert(
      {
        id: "default",
        locations: normalizedLocations,
        categories: normalizedCategories,
        allow_same_course_multiple_registrations:
          allowSameCourseMultipleRegistrations,
        max_active_registrations_per_user: Math.max(
          0,
          Math.floor(maxActiveCourseRegistrations || 0),
        ),
        email_reminders_enabled: courseEmailRemindersEnabled,
        reminder_days_before: normalizedReminderDaysBefore,
      },
      { onConflict: "id" },
    );

    setCourseSettingsLoading(false);

    if (error) {
      setMessage(settingsErrorMessage(error.message));
      return;
    }

    setCourseLocations(
      normalizedLocations.length > 0 ? normalizedLocations : [""],
    );
    setCourseCategories(
      normalizedCategories.length > 0 ? normalizedCategories : [""],
    );
    setMaxActiveCourseRegistrations(
      Math.max(0, Math.floor(maxActiveCourseRegistrations || 0)),
    );
    setCourseReminderDaysBefore(normalizedReminderDaysBefore);
    setSuccess("Kurs-Einstellungen gespeichert.");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Einstellungen"
        eyebrow={
          mode === "e-bikes"
            ? "Admin · E-Bikes"
            : mode === "messages"
              ? "Admin · Nachrichten"
              : mode === "calendar"
                ? "Admin · Kalender"
                : "Admin · Gesundheitskurse"
        }
        action={<SettingsSectionNav isAdmin={isAdmin} />}
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      {isAdmin && mode === "e-bikes" ? (
        <>
          <Card className="p-5">
            <form onSubmit={saveAvailability} className="space-y-4">
              <div className="flex items-center gap-2">
                <Bike className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">E-Bike Verfügbarkeit</h2>
              </div>

              <div className="grid gap-3">
                {availability.map((item) => (
                  <div
                    key={item.day_of_week}
                    className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[150px_1fr_1fr] sm:items-center"
                  >
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={(event) =>
                          updateAvailability(item.day_of_week, {
                            active: event.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      {WEEKDAY_LABELS[item.day_of_week]}
                    </label>
                    <Field>
                      <Label htmlFor={`ebike-start-${item.day_of_week}`}>
                        Von
                      </Label>
                      <Input
                        id={`ebike-start-${item.day_of_week}`}
                        type="time"
                        value={shortTime(item.start_time)}
                        disabled={!item.active}
                        onChange={(event) =>
                          updateAvailability(item.day_of_week, {
                            start_time: `${event.target.value}:00`,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor={`ebike-end-${item.day_of_week}`}>
                        Bis
                      </Label>
                      <Input
                        id={`ebike-end-${item.day_of_week}`}
                        type="time"
                        value={shortTime(item.end_time)}
                        disabled={!item.active}
                        onChange={(event) =>
                          updateAvailability(item.day_of_week, {
                            end_time: `${event.target.value}:00`,
                          })
                        }
                      />
                    </Field>
                  </div>
                ))}
              </div>

              <Button type="submit" disabled={availabilityLoading}>
                {availabilityLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Zeiten speichern
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <form onSubmit={saveBookingRules} className="space-y-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">E-Bike Buchungsregeln</h2>
              </div>

              <Field>
                <Label htmlFor="ebike-max-booking-days">
                  Maximale zusammenhängende Buchungsdauer
                </Label>
                <Input
                  id="ebike-max-booking-days"
                  type="number"
                  min={1}
                  max={EBIKE_RESERVATION_MAX_BOOKING_DAYS}
                  step={1}
                  value={maxBookingDays}
                  onChange={(event) =>
                    setMaxBookingDays(
                      Math.min(
                        EBIKE_RESERVATION_MAX_BOOKING_DAYS,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Wert in Tagen. Maximal {EBIKE_RESERVATION_MAX_BOOKING_DAYS}{" "}
                  Tage, also bis zu 1 Woche.
                </p>
              </Field>

              <Button type="submit" disabled={bookingRulesLoading}>
                {bookingRulesLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Buchungsregeln speichern
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <form onSubmit={saveSafetyConfirmation} className="space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">E-Bike Sicherheitsbestätigung</h2>
              </div>

              <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={safetyConfirmationEnabled}
                  onChange={(event) =>
                    setSafetyConfirmationEnabled(event.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                />
                Bestätigung vor Reservierung
              </label>

              <Field>
                <Label htmlFor="ebike-safety-confirmation-text">
                  Hinweistext
                </Label>
                <Textarea
                  id="ebike-safety-confirmation-text"
                  rows={5}
                  value={safetyConfirmationText}
                  disabled={!safetyConfirmationEnabled}
                  placeholder="Bitte nur mit Helm fahren. Bitte das E-Bike nach der Fahrt laden. Bitte Verkehrsregeln beachten."
                  onChange={(event) =>
                    setSafetyConfirmationText(event.target.value)
                  }
                />
              </Field>

              {safetyConfirmationEnabled &&
              safetyConfirmationText.trim().length > 0 ? (
                <div className="rounded-md border border-border bg-muted/45 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
                    Vorschau
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {safetyConfirmationText.trim()}
                  </p>
                </div>
              ) : null}

              <Button type="submit" disabled={safetyLoading}>
                {safetyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Bestätigung speichern
              </Button>
            </form>
          </Card>
        </>
      ) : null}

      {isAdmin && mode === "messages" ? (
        <Card className="p-5">
          <form onSubmit={saveMessageSettings} className="space-y-5">
            <div className="flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Nachrichten</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Kategorien</h3>
              </div>

              <div className="space-y-2">
                {messageCategories.map((category, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={category}
                      placeholder="z.B. Wichtig"
                      onChange={(event) =>
                        updateMessageCategory(index, event.target.value)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMessageCategory(index)}
                      title="Kategorie entfernen"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setMessageCategories((current) => [...current, ""])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Kategorie hinzufügen
              </Button>
            </div>

            <Button type="submit" disabled={messageSettingsLoading}>
              {messageSettingsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Nachrichten-Einstellungen speichern
            </Button>
          </form>
        </Card>
      ) : null}

      {isAdmin && mode === "calendar" ? (
        <Card className="p-5">
          <form onSubmit={saveCalendarSettings} className="space-y-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Kalender</h2>
            </div>

            <label className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm">
              <input
                type="checkbox"
                checked={calendarEmailRemindersEnabled}
                onChange={(event) =>
                  setCalendarEmailRemindersEnabled(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block font-medium">
                  E-Mail-Erinnerungen an Termine senden
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Wenn aktiviert, werden fällige Erinnerungen an
                  Mitarbeiter:innen und Admins gesendet.
                </span>
              </span>
            </label>

            <Field>
              <Label htmlFor="calendar-reminder-days-before">
                Erinnerung wie viele Tage vorher?
              </Label>
              <Input
                id="calendar-reminder-days-before"
                type="number"
                min={1}
                max={CALENDAR_REMINDER_MAX_DAYS}
                step={1}
                value={calendarReminderDaysBefore}
                disabled={!calendarEmailRemindersEnabled}
                onChange={(event) =>
                  setCalendarReminderDaysBefore(
                    Math.min(
                      CALENDAR_REMINDER_MAX_DAYS,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Maximal {CALENDAR_REMINDER_MAX_DAYS} Tage vorher. Der Versand
                erfolgt einmal pro Termin.
              </p>
            </Field>

            <div className="rounded-md border border-border bg-muted/35 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">E-Mail-Inhalt</p>
              <p className="mt-1">
                Die Erinnerung enthält den Hinweis „Kleine Erinnerung an einen
                bevorstehenden Termin“, Titel, Zeitpunkt, Ort, kurzen Auszug und
                einen Button zum Kalender.
              </p>
            </div>

            <Button type="submit" disabled={calendarSettingsLoading}>
              {calendarSettingsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Kalender-Einstellungen speichern
            </Button>
          </form>
        </Card>
      ) : null}

      {isAdmin && mode === "courses" ? (
          <Card className="p-5">
            <form onSubmit={saveHealthCourseSettings} className="space-y-5">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Gesundheitskurse</h2>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Orte</h3>
                  </div>

                  <div className="space-y-2">
                    {courseLocations.map((location, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={location}
                          placeholder="z.B. Bewegungsraum"
                          onChange={(event) =>
                            updateCourseLocation(index, event.target.value)
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCourseLocation(index)}
                          title="Ort entfernen"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCourseLocations((current) => [...current, ""])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ort hinzufügen
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Tags className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Kategorien</h3>
                  </div>

                  <div className="space-y-2">
                    {courseCategories.map((category, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={category}
                          placeholder="z.B. Rückenschule"
                          onChange={(event) =>
                            updateCourseCategory(index, event.target.value)
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCourseCategory(index)}
                          title="Kategorie entfernen"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCourseCategories((current) => [...current, ""])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Kategorie hinzufügen
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Buchungsregeln</h3>
                </div>

                <label className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={allowSameCourseMultipleRegistrations}
                    onChange={(event) =>
                      setAllowSameCourseMultipleRegistrations(
                        event.target.checked,
                      )
                    }
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">
                      Gleiche Kursart mehrfach buchbar
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      Wenn deaktiviert, kann ein Mitarbeiter nur einen aktiven
                      Termin mit gleichem Kurstitel und gleicher Kategorie
                      buchen.
                    </span>
                  </span>
                </label>

                <Field>
                  <Label htmlFor="max-active-course-registrations">
                    Maximale aktive Kursanmeldungen pro Mitarbeiter
                  </Label>
                  <Input
                    id="max-active-course-registrations"
                    type="number"
                    min={0}
                    step={1}
                    value={maxActiveCourseRegistrations}
                    onChange={(event) =>
                      setMaxActiveCourseRegistrations(
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    0 bedeutet unbegrenzt. Gezählt werden nur aktive,
                    noch nicht beendete Kursanmeldungen.
                  </p>
                </Field>
              </div>

              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Benachrichtigungen</h3>
                </div>

                <label className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={courseEmailRemindersEnabled}
                    onChange={(event) =>
                      setCourseEmailRemindersEnabled(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">
                      E-Mail-Erinnerungen an eingetragene Mitglieder senden
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      Wenn aktiviert, erhalten nur die Personen eine Erinnerung,
                      die im jeweiligen Kurs angemeldet sind.
                    </span>
                  </span>
                </label>

                <Field>
                  <Label htmlFor="course-reminder-days-before">
                    Erinnerung wie viele Tage vorher?
                  </Label>
                  <Input
                    id="course-reminder-days-before"
                    type="number"
                    min={1}
                    max={HEALTH_COURSE_REMINDER_MAX_DAYS}
                    step={1}
                    value={courseReminderDaysBefore}
                    disabled={!courseEmailRemindersEnabled}
                    onChange={(event) =>
                      setCourseReminderDaysBefore(
                        Math.min(
                          HEALTH_COURSE_REMINDER_MAX_DAYS,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximal {HEALTH_COURSE_REMINDER_MAX_DAYS} Tage vorher. Der
                    Versand erfolgt einmal pro Kurstermin.
                  </p>
                </Field>

                <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">E-Mail-Inhalt</p>
                  <p className="mt-1">
                    Die Erinnerung enthält Titel, Zeitpunkt, Ort, kurzen Auszug
                    und einen Button zur Kursübersicht.
                  </p>
                </div>
              </div>

              <Button type="submit" disabled={courseSettingsLoading}>
                {courseSettingsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Kurs-Einstellungen speichern
              </Button>
            </form>
          </Card>
      ) : null}
    </div>
  );
}
