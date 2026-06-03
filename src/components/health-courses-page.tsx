"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, addWeeks } from "date-fns";
import {
  CalendarDays,
  Clock,
  HeartPulse,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import type { AppRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { formatDate, formatTime, toDatetimeLocal } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Course = Database["public"]["Tables"]["health_courses"]["Row"];
type Registration = Database["public"]["Tables"]["course_registrations"]["Row"];
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email"
>;
type CourseStatus = Database["public"]["Enums"]["course_status"];
type ScheduleMode = "single" | "manual" | "recurring";
type RecurrenceInterval = "weekly" | "monthly";

type CourseDateRow = {
  id: string;
  start_time: string;
  end_time: string;
};

const statusLabel: Record<CourseStatus, string> = {
  available: "Verfuegbar",
  full: "Ausgebucht",
  completed: "Abgeschlossen",
  cancelled: "Abgesagt",
};

const statusTone: Record<CourseStatus, "neutral" | "success" | "warning" | "danger"> = {
  available: "success",
  full: "warning",
  completed: "neutral",
  cancelled: "danger",
};

type CourseForm = {
  id?: string;
  title: string;
  description: string;
  category: string;
  start_time: string;
  end_time: string;
  location: string;
  max_participants: number;
  status: CourseStatus;
  image_url: string;
  notes: string;
};

function nextCourseRange() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    start_time: toDatetimeLocal(start),
    end_time: toDatetimeLocal(end),
  };
}

function makeCourseDateRow(startTime: string, endTime: string): CourseDateRow {
  return {
    id: crypto.randomUUID(),
    start_time: startTime,
    end_time: endTime,
  };
}

function shiftCourseDateRow(
  startTime: string,
  endTime: string,
  interval: RecurrenceInterval,
  index: number,
) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const shift = interval === "weekly" ? addWeeks : addMonths;

  return {
    startDate: shift(start, index),
    endDate: shift(end, index),
  };
}

function emptyCourseForm(): CourseForm {
  return {
    title: "",
    description: "",
    category: "",
    ...nextCourseRange(),
    location: "",
    max_participants: 10,
    status: "available",
    image_url: "",
    notes: "",
  };
}

function fromCourse(course: Course): CourseForm {
  return {
    id: course.id,
    title: course.title,
    description: course.description ?? "",
    category: course.category ?? "",
    start_time: toDatetimeLocal(course.start_time),
    end_time: toDatetimeLocal(course.end_time),
    location: course.location ?? "",
    max_participants: course.max_participants,
    status: course.status,
    image_url: course.image_url ?? "",
    notes: course.notes ?? "",
  };
}

function durationMinutes(course: Course) {
  return Math.max(
    0,
    Math.round(
      (new Date(course.end_time).getTime() -
        new Date(course.start_time).getTime()) /
        60_000,
    ),
  );
}

function friendlyError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("ausgebucht")) return "Der Kurs ist bereits ausgebucht.";
  if (lower.includes("24 stunden")) {
    return "Stornierung ist nur bis 24 Stunden vor Kursbeginn moeglich.";
  }
  if (lower.includes("endzeit")) return "Endzeit muss nach Startzeit liegen.";
  if (lower.includes("vergangenheit")) {
    return "Startzeit darf nicht in der Vergangenheit liegen.";
  }
  return message;
}

export function HealthCoursesPage({
  initialCourses,
  initialRegistrations,
  initialProfiles,
  userId,
  roles,
}: {
  initialCourses: Course[];
  initialRegistrations: Registration[];
  initialProfiles: Profile[];
  userId: string;
  roles: AppRole[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [courses, setCourses] = useState(initialCourses);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [form, setForm] = useState<CourseForm>(emptyCourseForm());
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CourseStatus>("all");
  const [nowMs, setNowMs] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("single");
  const [manualDates, setManualDates] = useState<CourseDateRow[]>([]);
  const [recurrenceInterval, setRecurrenceInterval] =
    useState<RecurrenceInterval>("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState(10);

  const isAdmin = roles.includes("admin");
  const isPhysio = roles.includes("physiotherapy");
  const canManage = isAdmin || isPhysio;

  const profileById = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((profile) => {
      map.set(
        profile.id,
        profile.full_name?.trim() || profile.email?.trim() || "Unbekannt",
      );
    });
    return map;
  }, [profiles]);

  const registeredByCourse = useMemo(() => {
    const map = new Map<string, Registration[]>();
    registrations
      .filter((registration) => registration.status === "registered")
      .forEach((registration) => {
        const current = map.get(registration.course_id) ?? [];
        current.push(registration);
        map.set(registration.course_id, current);
      });
    return map;
  }, [registrations]);

  const reload = useCallback(async () => {
    const [courseResult, registrationResult, profileResult] = await Promise.all([
      supabase
        .from("health_courses")
        .select("*")
        .order("start_time", { ascending: true }),
      supabase.from("course_registrations").select("*"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    setCourses((courseResult.data ?? []) as Course[]);
    setRegistrations((registrationResult.data ?? []) as Registration[]);
    setProfiles((profileResult.data ?? []) as Profile[]);
  }, [supabase]);

  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now());
    const timeout = window.setTimeout(refreshNow, 0);
    const interval = window.setInterval(refreshNow, 60_000);

    const channel = supabase
      .channel("ullis-health-courses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "health_courses" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_registrations" },
        () => reload(),
      )
      .subscribe();

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  const visibleCourses = useMemo(() => {
    const base = isPhysio && !isAdmin
      ? courses.filter((course) => course.provider_id === userId)
      : courses;
    const query = search.trim().toLowerCase();

    return base.filter((course) => {
      if (statusFilter !== "all" && course.status !== statusFilter) return false;
      if (!query) return true;
      return [
        course.title,
        course.description,
        course.category,
        course.location,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [courses, isAdmin, isPhysio, search, statusFilter, userId]);

  function myRegistration(courseId: string) {
    return registrations.find(
      (registration) =>
        registration.course_id === courseId &&
        registration.user_id === userId &&
        registration.status === "registered",
    );
  }

  function openCreate() {
    setForm(emptyCourseForm());
    setScheduleMode("single");
    setManualDates([]);
    setRecurrenceInterval("weekly");
    setRecurrenceCount(10);
    setShowForm(true);
    setMessage(null);
  }

  function openEdit(course: Course) {
    setForm(fromCourse(course));
    setScheduleMode("single");
    setManualDates([]);
    setShowForm(true);
    setMessage(null);
  }

  function addManualDate() {
    const last = manualDates.at(-1);
    const baseStart = last?.start_time ?? form.start_time;
    const baseEnd = last?.end_time ?? form.end_time;
    const next = shiftCourseDateRow(baseStart, baseEnd, "weekly", 1);

    setManualDates([
      ...manualDates,
      makeCourseDateRow(
        toDatetimeLocal(next.startDate),
        toDatetimeLocal(next.endDate),
      ),
    ]);
  }

  function updateManualDate(
    id: string,
    field: "start_time" | "end_time",
    value: string,
  ) {
    setManualDates(
      manualDates.map((dateRow) =>
        dateRow.id === id ? { ...dateRow, [field]: value } : dateRow,
      ),
    );
  }

  function removeManualDate(id: string) {
    setManualDates(manualDates.filter((dateRow) => dateRow.id !== id));
  }

  function getCourseOccurrences() {
    if (form.id || scheduleMode === "single") {
      return [
        {
          startDate: new Date(form.start_time),
          endDate: new Date(form.end_time),
        },
      ];
    }

    if (scheduleMode === "manual") {
      return [
        {
          startDate: new Date(form.start_time),
          endDate: new Date(form.end_time),
        },
        ...manualDates.map((dateRow) => ({
          startDate: new Date(dateRow.start_time),
          endDate: new Date(dateRow.end_time),
        })),
      ];
    }

    return Array.from({ length: recurrenceCount }).map((_, index) =>
      shiftCourseDateRow(
        form.start_time,
        form.end_time,
        recurrenceInterval,
        index,
      ),
    );
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!form.title.trim()) {
      setMessage("Titel ist erforderlich.");
      return;
    }

    const occurrences = getCourseOccurrences();

    if (occurrences.length === 0) {
      setMessage("Bitte mindestens einen Termin angeben.");
      return;
    }

    if (occurrences.length > 52) {
      setMessage("Bitte maximal 52 Termine auf einmal anlegen.");
      return;
    }

    const invalidOccurrence = occurrences.find(
      (occurrence) => occurrence.endDate <= occurrence.startDate,
    );

    if (invalidOccurrence) {
      setMessage("Bei allen Terminen muss die Endzeit nach der Startzeit liegen.");
      return;
    }

    if (form.max_participants < 1) {
      setMessage("Mindestens eine teilnehmende Person ist erforderlich.");
      return;
    }

    if (
      !form.id &&
      scheduleMode === "recurring" &&
      (!Number.isInteger(recurrenceCount) ||
        recurrenceCount < 1 ||
        recurrenceCount > 52)
    ) {
      setMessage("Bitte eine Terminanzahl zwischen 1 und 52 angeben.");
      return;
    }

    setLoading(true);

    const payloadBase = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      location: form.location.trim() || null,
      max_participants: form.max_participants,
      status: form.status,
      image_url: form.image_url.trim() || null,
      notes: form.notes.trim() || null,
      provider_id: userId,
    };

    const { error } = form.id
      ? await supabase
          .from("health_courses")
          .update({
            ...payloadBase,
            start_time: occurrences[0].startDate.toISOString(),
            end_time: occurrences[0].endDate.toISOString(),
          })
          .eq("id", form.id)
      : await supabase.from("health_courses").insert(
          occurrences.map((occurrence) => ({
            ...payloadBase,
            start_time: occurrence.startDate.toISOString(),
            end_time: occurrence.endDate.toISOString(),
          })),
        );

    setLoading(false);

    if (error) {
      setMessage(friendlyError(error.message));
      return;
    }

    setShowForm(false);
    setScheduleMode("single");
    setManualDates([]);
    await reload();
  }

  async function register(course: Course) {
    setMessage(null);
    setLoading(true);

    const existing = registrations.find(
      (registration) =>
        registration.course_id === course.id && registration.user_id === userId,
    );

    const { error } = existing
      ? await supabase
          .from("course_registrations")
          .update({ status: "registered" })
          .eq("id", existing.id)
      : await supabase.from("course_registrations").insert({
          course_id: course.id,
          user_id: userId,
          status: "registered",
        });

    setLoading(false);

    if (error) {
      setMessage(friendlyError(error.message));
      return;
    }

    await reload();
  }

  async function unregister(course: Course) {
    const registration = myRegistration(course.id);
    if (!registration) return;
    if (!window.confirm("Kursanmeldung stornieren?")) return;

    const { error } = await supabase
      .from("course_registrations")
      .update({ status: "cancelled" })
      .eq("id", registration.id);

    if (error) {
      setMessage(friendlyError(error.message));
      return;
    }

    await reload();
  }

  async function setCourseStatus(course: Course, status: CourseStatus) {
    const { error } = await supabase
      .from("health_courses")
      .update({ status })
      .eq("id", course.id);

    if (error) {
      setMessage(friendlyError(error.message));
      return;
    }

    await reload();
  }

  async function deleteCourse(course: Course) {
    if (!window.confirm(`Kurs "${course.title}" loeschen?`)) return;

    const { error } = await supabase
      .from("health_courses")
      .delete()
      .eq("id", course.id);

    if (error) {
      setMessage(friendlyError(error.message));
      return;
    }

    await reload();
  }

  async function toggleAttendance(registration: Registration) {
    const { error } = await supabase
      .from("course_registrations")
      .update({ attendance_confirmed: !registration.attendance_confirmed })
      .eq("id", registration.id);

    if (error) {
      setMessage(friendlyError(error.message));
      return;
    }

    await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gesundheitskurse"
        eyebrow="Angebote und Teilnahmen"
        action={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Neuer Kurs
            </Button>
          ) : undefined
        }
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <Input
            type="search"
            placeholder="Suchen"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | CourseStatus)
            }
          >
            <option value="all">Alle Status</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {canManage && showForm ? (
        <Card className="p-5">
          <form onSubmit={saveCourse} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">
                {form.id ? "Kurs bearbeiten" : "Neuer Kurs"}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowForm(false)}
                title="Schliessen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <Label htmlFor="course-title">Titel</Label>
                <Input
                  id="course-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="course-category">Kategorie</Label>
                <Input
                  id="course-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                />
              </Field>
              <Field>
                <Label htmlFor="course-start">Start</Label>
                <Input
                  id="course-start"
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(event) =>
                    setForm({ ...form, start_time: event.target.value })
                  }
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="course-end">Ende</Label>
                <Input
                  id="course-end"
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(event) =>
                    setForm({ ...form, end_time: event.target.value })
                  }
                  required
                />
              </Field>
              {!form.id ? (
                <div className="space-y-4 rounded-md border border-border bg-muted/40 p-4 md:col-span-2">
                  <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                    <Field>
                      <Label htmlFor="course-schedule-mode">Terminplanung</Label>
                      <Select
                        id="course-schedule-mode"
                        value={scheduleMode}
                        onChange={(event) =>
                          setScheduleMode(event.target.value as ScheduleMode)
                        }
                      >
                        <option value="single">Einzeltermin</option>
                        <option value="manual">Mehrere Daten manuell</option>
                        <option value="recurring">Serie erstellen</option>
                      </Select>
                    </Field>
                    <div className="flex items-end text-sm text-muted-foreground">
                      {scheduleMode === "single"
                        ? "Es wird genau ein Kurstermin angelegt."
                        : scheduleMode === "manual"
                          ? "Der Starttermin oben zaehlt als erster Termin. Weitere Daten kannst du unten ergaenzen."
                          : "Aus dem Starttermin oben wird automatisch eine Terminserie erzeugt."}
                    </div>
                  </div>

                  {scheduleMode === "manual" ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            Zusaetzliche Termine
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Insgesamt: {manualDates.length + 1} Termine
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addManualDate}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Termin hinzufuegen
                        </Button>
                      </div>

                      {manualDates.length > 0 ? (
                        <div className="space-y-2">
                          {manualDates.map((dateRow, index) => (
                            <div
                              key={dateRow.id}
                              className="grid gap-2 rounded-md border border-border bg-card p-3 md:grid-cols-[1fr_1fr_auto]"
                            >
                              <Field>
                                <Label htmlFor={`manual-start-${dateRow.id}`}>
                                  Termin {index + 2} Start
                                </Label>
                                <Input
                                  id={`manual-start-${dateRow.id}`}
                                  type="datetime-local"
                                  value={dateRow.start_time}
                                  onChange={(event) =>
                                    updateManualDate(
                                      dateRow.id,
                                      "start_time",
                                      event.target.value,
                                    )
                                  }
                                  required
                                />
                              </Field>
                              <Field>
                                <Label htmlFor={`manual-end-${dateRow.id}`}>
                                  Termin {index + 2} Ende
                                </Label>
                                <Input
                                  id={`manual-end-${dateRow.id}`}
                                  type="datetime-local"
                                  value={dateRow.end_time}
                                  min={dateRow.start_time}
                                  onChange={(event) =>
                                    updateManualDate(
                                      dateRow.id,
                                      "end_time",
                                      event.target.value,
                                    )
                                  }
                                  required
                                />
                              </Field>
                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeManualDate(dateRow.id)}
                                  title="Termin entfernen"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {scheduleMode === "recurring" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field>
                        <Label htmlFor="course-recurrence-count">
                          Anzahl Termine
                        </Label>
                        <Input
                          id="course-recurrence-count"
                          type="number"
                          min={1}
                          max={52}
                          value={recurrenceCount}
                          onChange={(event) =>
                            setRecurrenceCount(Number(event.target.value))
                          }
                          required
                        />
                      </Field>
                      <Field>
                        <Label htmlFor="course-recurrence-interval">
                          Rhythmus
                        </Label>
                        <Select
                          id="course-recurrence-interval"
                          value={recurrenceInterval}
                          onChange={(event) =>
                            setRecurrenceInterval(
                              event.target.value as RecurrenceInterval,
                            )
                          }
                        >
                          <option value="weekly">Woechentlich</option>
                          <option value="monthly">Monatlich</option>
                        </Select>
                      </Field>
                      <p className="text-sm text-muted-foreground md:col-span-2">
                        Es werden {recurrenceCount || 0} Termine mit gleicher
                        Dauer, gleichem Ort, gleicher Beschreibung und gleicher
                        Kapazitaet angelegt.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <Field>
                <Label htmlFor="course-location">Ort</Label>
                <Input
                  id="course-location"
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                />
              </Field>
              <Field>
                <Label htmlFor="course-max">Plaetze</Label>
                <Input
                  id="course-max"
                  type="number"
                  min={1}
                  value={form.max_participants}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      max_participants: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="course-status">Status</Label>
                <Select
                  id="course-status"
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as CourseStatus,
                    })
                  }
                >
                  {Object.entries(statusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="course-image">Bild-URL</Label>
                <Input
                  id="course-image"
                  value={form.image_url}
                  onChange={(event) =>
                    setForm({ ...form, image_url: event.target.value })
                  }
                />
              </Field>
              <Field className="md:col-span-2">
                <Label htmlFor="course-description">Beschreibung</Label>
                <Textarea
                  id="course-description"
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </Field>
              <Field className="md:col-span-2">
                <Label htmlFor="course-notes">Interne Notizen</Label>
                <Textarea
                  id="course-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </Field>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {form.id
                ? "Speichern"
                : scheduleMode === "single"
                  ? "Kurs anlegen"
                  : "Termine anlegen"}
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visibleCourses.map((course) => {
          const participants = registeredByCourse.get(course.id) ?? [];
          const free = Math.max(0, course.max_participants - participants.length);
          const mine = myRegistration(course.id);
          const isPast = new Date(course.end_time).getTime() < nowMs;
          const effectiveStatus: CourseStatus =
            course.status === "available" && isPast
              ? "completed"
              : course.status === "available" && free === 0
                ? "full"
                : course.status;
          const canEditThis =
            isAdmin || (isPhysio && course.provider_id === userId);
          const canRegister =
            !isPhysio || isAdmin;
          const cancellable =
            new Date(course.start_time).getTime() - nowMs >
            24 * 60 * 60 * 1000;

          return (
            <Card key={course.id} className="flex flex-col overflow-hidden">
              {course.image_url ? (
                <div className="aspect-[16/9] bg-muted">
                  <img
                    src={course.image_url}
                    alt={course.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center bg-muted">
                  <HeartPulse className="h-10 w-10 text-primary/70" />
                </div>
              )}

              <div className="flex flex-1 flex-col space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-lg font-semibold">
                      {course.title}
                    </h2>
                    {course.category ? (
                      <p className="text-sm text-muted-foreground">
                        {course.category}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={statusTone[effectiveStatus]}>
                    {statusLabel[effectiveStatus]}
                  </Badge>
                </div>

                {course.description ? (
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {course.description}
                  </p>
                ) : null}

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span>
                      {formatDate(course.start_time)} ·{" "}
                      {formatTime(course.start_time)}-{formatTime(course.end_time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>{durationMinutes(course)} Min.</span>
                  </div>
                  {course.location ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="truncate">{course.location}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>
                      {participants.length} / {course.max_participants} · {free} frei
                    </span>
                  </div>
                  <p className="text-xs">
                    Anbieter: {profileById.get(course.provider_id) ?? "Team"}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {canRegister &&
                  course.status === "available" &&
                  !isPast &&
                  free > 0 &&
                  !mine ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => register(course)}
                      disabled={loading}
                    >
                      Anmelden
                    </Button>
                  ) : null}
                  {canRegister && mine ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => unregister(course)}
                      disabled={!cancellable}
                      title={
                        !cancellable
                          ? "Stornierung nur bis 24 Stunden vor Beginn"
                          : undefined
                      }
                    >
                      Stornieren
                    </Button>
                  ) : null}
                  {canEditThis ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(course)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </Button>
                      {course.status !== "cancelled" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCourseStatus(course, "cancelled")}
                        >
                          Absagen
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCourse(course)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        Loeschen
                      </Button>
                    </>
                  ) : null}
                </div>

                {canEditThis && participants.length > 0 ? (
                  <details className="rounded-md border border-border px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Teilnehmende ({participants.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {participants.map((registration) => (
                        <label
                          key={registration.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0 truncate">
                            {profileById.get(registration.user_id) ??
                              registration.user_id}
                          </span>
                          <input
                            type="checkbox"
                            checked={registration.attendance_confirmed}
                            onChange={() => toggleAttendance(registration)}
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </Card>
          );
        })}

        {visibleCourses.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground lg:col-span-2 xl:col-span-3">
            Keine Kurse gefunden.
          </Card>
        ) : null}
      </section>
    </div>
  );
}
