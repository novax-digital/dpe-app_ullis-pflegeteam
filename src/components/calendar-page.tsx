"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
  Textarea,
} from "@/components/ui";
import type { Database } from "@/lib/database.types";
import { formatDateTime, formatTime, toDatetimeLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type CalendarEvent = Database["public"]["Tables"]["calendar_events"]["Row"];
type HealthCourse = Pick<
  Database["public"]["Tables"]["health_courses"]["Row"],
  "id" | "title" | "description" | "location" | "start_time" | "end_time" | "status"
>;

type UnifiedEvent = {
  id: string;
  source: "calendar" | "course";
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  status?: string;
};

type EventForm = {
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
};

function emptyEventForm(selectedDate: Date): EventForm {
  const start = new Date(selectedDate);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(12, 0, 0, 0);

  return {
    title: "",
    description: "",
    location: "",
    start_time: toDatetimeLocal(start),
    end_time: toDatetimeLocal(end),
    all_day: false,
  };
}

function eventTouchesDay(event: UnifiedEvent, day: Date) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return start < dayEnd && end > dayStart;
}

function courseStatusTone(status?: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "cancelled") return "danger";
  if (status === "completed") return "neutral";
  if (status === "full") return "warning";
  return "info";
}

export function CalendarPage({
  initialCalendarEvents,
  initialCourses,
  userId,
  isAdmin,
  initialMonth,
}: {
  initialCalendarEvents: CalendarEvent[];
  initialCourses: HealthCourse[];
  userId: string;
  isAdmin: boolean;
  initialMonth: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [calendarEvents, setCalendarEvents] = useState(initialCalendarEvents);
  const [courses, setCourses] = useState(initialCourses);
  const [monthCursor, setMonthCursor] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(initialMonth);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(() =>
    emptyEventForm(new Date(initialMonth)),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEventRemoval, setPendingEventRemoval] =
    useState<UnifiedEvent | null>(null);

  const monthDate = useMemo(() => new Date(monthCursor), [monthCursor]);
  const selectedDay = useMemo(() => new Date(selectedDate), [selectedDate]);

  const unifiedEvents = useMemo<UnifiedEvent[]>(() => {
    const customEvents = calendarEvents.map((event) => ({
      id: event.id,
      source: "calendar" as const,
      title: event.title,
      description: event.description,
      location: event.location,
      start_time: event.start_time,
      end_time: event.end_time,
      all_day: event.all_day,
    }));

    const courseEvents = courses
      .filter((course) => course.status !== "cancelled")
      .map((course) => ({
        id: course.id,
        source: "course" as const,
        title: course.title,
        description: course.description,
        location: course.location,
        start_time: course.start_time,
        end_time: course.end_time,
        all_day: false,
        status: course.status,
      }));

    return [...customEvents, ...courseEvents].sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
  }, [calendarEvents, courses]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthDate]);

  const selectedEvents = useMemo(
    () => unifiedEvents.filter((event) => eventTouchesDay(event, selectedDay)),
    [selectedDay, unifiedEvents],
  );

  const reload = useCallback(async () => {
    const [eventsResult, coursesResult] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("*")
        .order("start_time", { ascending: true }),
      supabase
        .from("health_courses")
        .select("id, title, description, location, start_time, end_time, status")
        .order("start_time", { ascending: true }),
    ]);

    setCalendarEvents((eventsResult.data ?? []) as CalendarEvent[]);
    setCourses((coursesResult.data ?? []) as HealthCourse[]);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("ullis-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "health_courses" },
        () => reload(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  useEffect(() => {
    if (!showForm) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showForm]);

  function moveMonth(delta: number) {
    const next = addMonths(monthDate, delta);
    setMonthCursor(next.toISOString());
    setSelectedDate(startOfMonth(next).toISOString());
  }

  function openCreateForSelectedDay() {
    setForm(emptyEventForm(selectedDay));
    setShowForm(true);
    setMessage(null);
  }

  function closeEventForm() {
    setShowForm(false);
    setMessage(null);
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!form.title.trim()) {
      setMessage("Titel ist erforderlich.");
      return;
    }

    const startDate = new Date(form.start_time);
    const endDate = new Date(form.end_time);

    if (endDate <= startDate) {
      setMessage("Endzeit muss nach Startzeit liegen.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("calendar_events").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      all_day: form.all_day,
      created_by: userId,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    closeEventForm();
    setForm(emptyEventForm(selectedDay));
    await reload();
  }

  function deleteEvent(event: UnifiedEvent) {
    if (event.source !== "calendar") return;
    setPendingEventRemoval(event);
  }

  async function confirmDeleteEvent() {
    const event = pendingEventRemoval;
    if (!event || event.source !== "calendar") return;
    setPendingEventRemoval(null);

    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", event.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kalender"
        eyebrow="Teamtermine und Kurse"
        action={
          isAdmin ? (
            <Button onClick={openCreateForSelectedDay}>
              <Plus className="h-4 w-4" />
              Neuer Termin
            </Button>
          ) : undefined
        }
      />

      {message && !showForm ? <Notice tone="danger">{message}</Notice> : null}

      {isAdmin && showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEventForm();
            }
          }}
        >
          <Card
            className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-dialog-title"
          >
            <form onSubmit={saveEvent} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2
                    id="calendar-event-dialog-title"
                    className="font-semibold"
                  >
                    Neuer Termin
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {format(selectedDay, "EEEE, dd.MM.yyyy", { locale: de })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeEventForm}
                  title="Schließen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {message ? <Notice tone="danger">{message}</Notice> : null}

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <Label htmlFor="calendar-title">Titel</Label>
                  <Input
                    id="calendar-title"
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    placeholder="z.B. Mitarbeiterfest"
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="calendar-location">Ort</Label>
                  <Input
                    id="calendar-location"
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="calendar-start">Start</Label>
                  <Input
                    id="calendar-start"
                    type="datetime-local"
                    value={form.start_time}
                    onChange={(event) =>
                      setForm({ ...form, start_time: event.target.value })
                    }
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="calendar-end">Ende</Label>
                  <Input
                    id="calendar-end"
                    type="datetime-local"
                    value={form.end_time}
                    min={form.start_time}
                    onChange={(event) =>
                      setForm({ ...form, end_time: event.target.value })
                    }
                    required
                  />
                </Field>
                <Field className="md:col-span-2">
                  <Label htmlFor="calendar-description">Beschreibung</Label>
                  <Textarea
                    id="calendar-description"
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.all_day}
                    onChange={(event) =>
                      setForm({ ...form, all_day: event.target.checked })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  Ganztagestermin
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEventForm}
                >
                  Abbrechen
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Speichern
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {format(monthDate, "MMMM yyyy", { locale: de })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {unifiedEvents.length} Termine im Kalender
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveMonth(-1)}
                title="Vorheriger Monat"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveMonth(1)}
                title="Nächster Monat"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border bg-muted text-center text-xs font-medium text-muted-foreground">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
              <div key={day} className="px-2 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const eventsForDay = unifiedEvents.filter((event) =>
                eventTouchesDay(event, day),
              );
              const selected = isSameDay(day, selectedDay);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(day.toISOString())}
                  className={cn(
                    "min-h-28 border-b border-r border-border p-2 text-left transition hover:bg-accent",
                    !isSameMonth(day, monthDate) && "bg-muted/40 text-muted-foreground",
                    selected && "bg-accent ring-2 ring-inset ring-primary",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {format(day, "d")}
                    </span>
                    {eventsForDay.length > 0 ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        {eventsForDay.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {eventsForDay.slice(0, 3).map((event) => (
                      <div
                        key={`${event.source}-${event.id}`}
                        className={cn(
                          "truncate rounded px-1.5 py-1 text-xs",
                          event.source === "course"
                            ? "bg-sky-50 text-sky-800"
                            : "bg-primary/10 text-accent-foreground",
                        )}
                      >
                        {event.all_day ? "" : `${formatTime(event.start_time)} `}
                        {event.title}
                      </div>
                    ))}
                    {eventsForDay.length > 3 ? (
                      <p className="text-xs text-muted-foreground">
                        +{eventsForDay.length - 3} weitere
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {format(selectedDay, "EEEE, dd.MM.yyyy", { locale: de })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedEvents.length} Termine
              </p>
            </div>
            {isAdmin ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={openCreateForSelectedDay}
                title="Termin für diesen Tag"
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            {selectedEvents.map((event) => (
              <div
                key={`${event.source}-${event.id}`}
                className="rounded-md border border-border p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{event.title}</p>
                      <Badge
                        tone={
                          event.source === "course"
                            ? courseStatusTone(event.status)
                            : "warning"
                        }
                      >
                        {event.source === "course" ? "Kurs" : "Termin"}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0" />
                        {event.all_day
                          ? "Ganztags"
                          : `${formatDateTime(event.start_time)} bis ${formatDateTime(event.end_time)}`}
                      </p>
                      {event.location ? (
                        <p className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 shrink-0" />
                          {event.location}
                        </p>
                      ) : null}
                    </div>
                    {event.description ? (
                      <p className="mt-2 text-muted-foreground">
                        {event.description}
                      </p>
                    ) : null}
                  </div>
                  {isAdmin && event.source === "calendar" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEvent(event)}
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}

            {selectedEvents.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <CalendarDays className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Keine Termine an diesem Tag.
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      <ConfirmDialog
        open={Boolean(pendingEventRemoval)}
        title="Termin löschen?"
        description="Dieser Kalendereintrag wird dauerhaft entfernt."
        detail={pendingEventRemoval?.title}
        confirmLabel="Termin löschen"
        onCancel={() => setPendingEventRemoval(null)}
        onConfirm={confirmDeleteEvent}
      />
    </div>
  );
}
