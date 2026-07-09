"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { addMonths, addWeeks } from "date-fns";
import {
  CalendarDays,
  Clock,
  CloudUpload,
  Copy,
  HeartPulse,
  ImagePlus,
  LayoutGrid,
  List,
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
  ConfirmDialog,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import type { AppRole } from "@/lib/auth";
import {
  COURSE_IMAGE_ACCEPTED_TYPES,
  COURSE_IMAGE_MAX_BYTES,
} from "@/lib/course-images";
import type { Database } from "@/lib/database.types";
import { formatDate, formatTime, toDatetimeLocal } from "@/lib/format";
import {
  normalizeHealthCourseSettings,
  type HealthCourseSettings,
} from "@/lib/health-course-settings";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Course = Database["public"]["Tables"]["health_courses"]["Row"];
type Registration = Database["public"]["Tables"]["course_registrations"]["Row"];
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email"
>;
type CourseStatus = Database["public"]["Enums"]["course_status"];
type ScheduleMode = "single" | "manual" | "recurring";
type RecurrenceInterval = "weekly" | "monthly";
type HealthCoursesMode = "overview" | "manage";
type CourseViewMode = "grid" | "list";

type CourseDateRow = {
  id: string;
  start_time: string;
  end_time: string;
};

type CourseGroup = {
  key: string;
  representative: Course;
  courses: Course[];
};

const statusLabel: Record<CourseStatus, string> = {
  available: "Verfügbar",
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

const sectionItems = [
  {
    href: "/health-courses/uebersicht",
    label: "Kursübersicht",
    icon: HeartPulse,
    modes: ["overview", "manage"] as HealthCoursesMode[],
  },
  {
    href: "/health-courses/verwaltung",
    label: "Kursverwaltung",
    icon: CalendarDays,
    modes: ["manage"] as HealthCoursesMode[],
  },
];

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

function courseIdentityKey(course: Pick<Course, "title" | "category">) {
  return [
    course.title.trim().toLowerCase(),
    (course.category ?? "").trim().toLowerCase(),
  ].join("::");
}

function sortCoursesByStart(courses: Course[]) {
  return [...courses].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
}

function courseGroupKey(course: Course) {
  return courseIdentityKey(course);
}

function pickCourseGroupRepresentative(courses: Course[], nowMs: number) {
  return (
    courses.find((course) => new Date(course.end_time).getTime() >= nowMs) ??
    courses[0]
  );
}

function courseParticipationPercentage(current: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

function courseParticipationFillClass(percentage: number) {
  if (percentage >= 100) return "bg-red-500";
  if (percentage >= 80) return "bg-amber-500";
  return "bg-primary";
}

function CourseParticipationBar({
  current,
  max,
  compact = false,
}: {
  current: number;
  max: number;
  compact?: boolean;
}) {
  const percentage = courseParticipationPercentage(current, max);

  return (
    <div className={cn("min-w-0", compact ? "space-y-1" : "space-y-1.5")}>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Auslastung</span>
        <span className="shrink-0 font-medium text-foreground">
          {current}/{max}
        </span>
      </div>
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          compact ? "h-1.5" : "h-2",
        )}
        aria-label={`Auslastung ${percentage} Prozent`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            courseParticipationFillClass(percentage),
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function friendlyError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("ausgebucht")) return "Der Kurs ist bereits ausgebucht.";
  if (lower.includes("maximale anzahl aktiver kursanmeldungen")) {
    return "Das geht leider nicht, weil du die maximale Anzahl aktiver Kursanmeldungen erreicht hast.";
  }
  if (lower.includes("bereits aktiv gebucht")) {
    return "Du bist bereits für einen aktiven Termin dieser Kursart angemeldet.";
  }
  if (lower.includes("24 stunden")) {
    return "Stornierung ist nur bis 24 Stunden vor Kursbeginn möglich.";
  }
  if (lower.includes("endzeit")) return "Endzeit muss nach Startzeit liegen.";
  if (lower.includes("vergangenheit")) {
    return "Startzeit darf nicht in der Vergangenheit liegen.";
  }
  return message;
}

function HealthCoursesSectionNav({ mode }: { mode: HealthCoursesMode }) {
  const pathname = usePathname();
  const visibleItems = sectionItems.filter((item) => item.modes.includes(mode));

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

export function HealthCoursesPage({
  mode,
  initialCourses,
  initialRegistrations,
  initialProfiles,
  initialCourseSettings,
  userId,
  roles,
}: {
  mode: HealthCoursesMode;
  initialCourses: Course[];
  initialRegistrations: Registration[];
  initialProfiles: Profile[];
  initialCourseSettings: HealthCourseSettings;
  userId: string;
  roles: AppRole[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [courses, setCourses] = useState(initialCourses);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [courseSettings, setCourseSettings] = useState(() =>
    normalizeHealthCourseSettings(initialCourseSettings),
  );
  const [form, setForm] = useState<CourseForm>(emptyCourseForm());
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CourseStatus>("all");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");
  const [nowMs, setNowMs] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("single");
  const [manualDates, setManualDates] = useState<CourseDateRow[]>([]);
  const [recurrenceInterval, setRecurrenceInterval] =
    useState<RecurrenceInterval>("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [pendingCourseUnregister, setPendingCourseUnregister] =
    useState<Course | null>(null);
  const [pendingCourseRemoval, setPendingCourseRemoval] =
    useState<Course | null>(null);

  const isAdmin = roles.includes("admin");
  const isPhysio = roles.includes("physiotherapy");
  const canManage = isAdmin || isPhysio;
  const isManagementMode = mode === "manage";
  const imagePreviewUrlRef = useRef<string | null>(null);
  const displayedImageUrl = imagePreviewUrl ?? form.image_url;
  const courseCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...courseSettings.categories, form.category]
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "de")),
    [courseSettings.categories, form.category],
  );
  const courseLocationOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...courseSettings.locations, form.location]
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "de")),
    [courseSettings.locations, form.location],
  );

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

  const courseById = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach((course) => {
      map.set(course.id, course);
    });
    return map;
  }, [courses]);

  const myActiveRegistrations = useMemo(
    () =>
      registrations.filter((registration) => {
        const course = courseById.get(registration.course_id);

        return (
          registration.user_id === userId &&
          registration.status === "registered" &&
          course?.status !== "cancelled" &&
          new Date(course?.end_time ?? 0).getTime() >= nowMs
        );
      }),
    [courseById, nowMs, registrations, userId],
  );

  const activeCourseLimitReached =
    courseSettings.max_active_registrations_per_user > 0 &&
    myActiveRegistrations.length >=
      courseSettings.max_active_registrations_per_user;

  const reload = useCallback(async () => {
    const [courseResult, registrationResult, profileResult, settingsResult] =
      await Promise.all([
        supabase
          .from("health_courses")
          .select("*")
          .order("start_time", { ascending: true }),
        supabase.from("course_registrations").select("*"),
        supabase.from("profiles").select("id, full_name, email"),
        supabase
          .from("health_course_settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle(),
      ]);

    setCourses((courseResult.data ?? []) as Course[]);
    setRegistrations((registrationResult.data ?? []) as Registration[]);
    setProfiles((profileResult.data ?? []) as Profile[]);
    setCourseSettings(normalizeHealthCourseSettings(settingsResult.data));
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "health_course_settings" },
        () => reload(),
      )
      .subscribe();

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      }
    };
  }, []);

  const visibleCourses = useMemo(() => {
    const base = isManagementMode
      ? isPhysio && !isAdmin
        ? courses.filter((course) => course.provider_id === userId)
        : courses
      : courses.filter(
          (course) =>
            course.status !== "cancelled" &&
            new Date(course.end_time).getTime() >= nowMs,
        );
    const query = search.trim().toLowerCase();

    return base.filter((course) => {
      if (
        isManagementMode &&
        statusFilter !== "all" &&
        course.status !== statusFilter
      ) {
        return false;
      }
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
  }, [
    courses,
    isAdmin,
    isManagementMode,
    isPhysio,
    nowMs,
    search,
    statusFilter,
    userId,
  ]);

  const managementCourseGroups = useMemo<CourseGroup[]>(() => {
    if (!isManagementMode) return [];

    const groups = new Map<string, Course[]>();

    visibleCourses.forEach((course) => {
      const key = courseGroupKey(course);
      groups.set(key, [...(groups.get(key) ?? []), course]);
    });

    return Array.from(groups.entries())
      .map(([key, groupCourses]) => {
        const sortedCourses = sortCoursesByStart(groupCourses);

        return {
          key,
          courses: sortedCourses,
          representative: pickCourseGroupRepresentative(sortedCourses, nowMs),
        };
      })
      .sort((a, b) => {
        const titleCompare = a.representative.title.localeCompare(
          b.representative.title,
          "de",
        );

        if (titleCompare !== 0) return titleCompare;

        return (
          new Date(a.representative.start_time).getTime() -
          new Date(b.representative.start_time).getTime()
        );
      });
  }, [isManagementMode, nowMs, visibleCourses]);

  function myRegistration(courseId: string) {
    return registrations.find(
      (registration) =>
        registration.course_id === courseId &&
        registration.user_id === userId &&
        registration.status === "registered",
    );
  }

  function sameCourseAlreadyBooked(course: Course) {
    if (courseSettings.allow_same_course_multiple_registrations) {
      return false;
    }

    const targetKey = courseIdentityKey(course);

    return myActiveRegistrations.some((registration) => {
      if (registration.course_id === course.id) {
        return false;
      }

      const activeCourse = courseById.get(registration.course_id);
      return activeCourse ? courseIdentityKey(activeCourse) === targetKey : false;
    });
  }

  function registrationBlockReason(course: Course) {
    if (sameCourseAlreadyBooked(course)) {
      return "Du bist bereits für einen aktiven Termin dieser Kursart angemeldet.";
    }

    if (activeCourseLimitReached) {
      return "Das geht leider nicht, weil du die maximale Anzahl aktiver Kursanmeldungen erreicht hast.";
    }

    return null;
  }

  function setSelectedImageFile(file: File | null) {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }

    const nextPreviewUrl = file ? URL.createObjectURL(file) : null;
    imagePreviewUrlRef.current = nextPreviewUrl;
    setImagePreviewUrl(nextPreviewUrl);
    setImageFile(file);
  }

  function selectImageFile(file: File | null) {
    setMessage(null);

    if (!file) {
      setSelectedImageFile(null);
      return true;
    }

    if (!COURSE_IMAGE_ACCEPTED_TYPES.includes(file.type)) {
      setSelectedImageFile(null);
      setMessage("Bitte ein Bild im Format JPG, PNG, WebP oder GIF auswählen.");
      return false;
    }

    if (file.size > COURSE_IMAGE_MAX_BYTES) {
      setSelectedImageFile(null);
      setMessage("Das Bild darf maximal 12 MB groß sein.");
      return false;
    }

    setSelectedImageFile(file);
    return true;
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!selectImageFile(file)) {
      event.target.value = "";
    }
  }

  function handleImageDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setImageDragActive(false);
    selectImageFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function uploadCourseImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/course-images", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as {
      publicUrl?: string;
      error?: string;
    };

    if (!response.ok || !data.publicUrl) {
      throw new Error(data.error ?? "Das Bild konnte nicht hochgeladen werden.");
    }

    return data.publicUrl;
  }

  function closeCourseForm() {
    setShowForm(false);
    setSelectedImageFile(null);
  }

  function openCreate() {
    setForm(emptyCourseForm());
    setSelectedImageFile(null);
    setScheduleMode("single");
    setManualDates([]);
    setRecurrenceInterval("weekly");
    setRecurrenceCount(10);
    setShowForm(true);
    setMessage(null);
  }

  function openEdit(course: Course) {
    setForm(fromCourse(course));
    setSelectedImageFile(null);
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

    try {
      const imageUrl = imageFile
        ? await uploadCourseImage(imageFile)
        : form.image_url.trim() || null;
      const payloadBase = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        location: form.location.trim() || null,
        max_participants: form.max_participants,
        status: form.status,
        image_url: imageUrl,
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

      if (error) {
        setMessage(friendlyError(error.message));
        return;
      }

      closeCourseForm();
      setScheduleMode("single");
      setManualDates([]);
      await reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Das Bild konnte nicht hochgeladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function register(course: Course) {
    setMessage(null);

    const blockedReason = registrationBlockReason(course);
    if (blockedReason) {
      setMessage(blockedReason);
      return;
    }

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

  function unregister(course: Course) {
    const registration = myRegistration(course.id);
    if (!registration) return;
    setPendingCourseUnregister(course);
  }

  async function confirmUnregister() {
    const course = pendingCourseUnregister;
    if (!course) return;
    const registration = myRegistration(course.id);
    setPendingCourseUnregister(null);
    if (!registration) return;

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

  async function duplicateCourse(course: Course) {
    setMessage(null);
    setLoading(true);

    const { error } = await supabase.from("health_courses").insert({
      title: `${course.title} Kopie`,
      description: course.description,
      category: course.category,
      start_time: course.start_time,
      end_time: course.end_time,
      location: course.location,
      max_participants: course.max_participants,
      status: course.status,
      image_url: course.image_url,
      notes: course.notes,
      provider_id: userId,
    });

    setLoading(false);

    if (error) {
      setMessage(friendlyError(error.message));
      return;
    }

    await reload();
  }

  function deleteCourse(course: Course) {
    setPendingCourseRemoval(course);
  }

  async function confirmDeleteCourse() {
    const course = pendingCourseRemoval;
    if (!course) return;
    setPendingCourseRemoval(null);

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
        title={isManagementMode ? "Kursverwaltung" : "Gesundheitskurse"}
        eyebrow={
          isManagementMode ? "Kurse anlegen und bearbeiten" : "Kursübersicht"
        }
        action={<HealthCoursesSectionNav mode={canManage ? "manage" : mode} />}
      />

      {isManagementMode && canManage ? (
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Neuer Kurs
          </Button>
        </div>
      ) : null}

      {message ? <Notice tone="danger">{message}</Notice> : null}

      <Card className="p-4">
        <div
          className={cn(
            "grid gap-3",
            isManagementMode
              ? "md:grid-cols-[1fr_220px]"
              : "md:grid-cols-[1fr_auto]",
          )}
        >
          <Input
            type="search"
            placeholder="Suchen"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {isManagementMode ? (
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
          ) : (
            <div className="inline-flex h-10 rounded-md border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-sm px-3 text-sm font-medium transition",
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-sm px-3 text-sm font-medium transition",
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title="List View"
              >
                <List className="h-4 w-4" />
                Liste
              </button>
            </div>
          )}
        </div>
      </Card>

      {isManagementMode && canManage && showForm ? (
        <Card className="min-w-0 overflow-hidden p-5">
          <form onSubmit={saveCourse} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">
                {form.id ? "Kurs bearbeiten" : "Neuer Kurs"}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeCourseForm}
                title="Schließen"
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
                <Select
                  id="course-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                >
                  <option value="">Kategorie auswählen</option>
                  {courseCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
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
                          ? "Der Starttermin oben zählt als erster Termin. Weitere Daten kannst du unten ergänzen."
                          : "Aus dem Starttermin oben wird automatisch eine Terminserie erzeugt."}
                    </div>
                  </div>

                  {scheduleMode === "manual" ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            Zusätzliche Termine
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
                          Termin hinzufügen
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
                          <option value="weekly">Wöchentlich</option>
                          <option value="monthly">Monatlich</option>
                        </Select>
                      </Field>
                      <p className="text-sm text-muted-foreground md:col-span-2">
                        Es werden {recurrenceCount || 0} Termine mit gleicher
                        Dauer, gleichem Ort, gleicher Beschreibung und gleicher
                        Kapazität angelegt.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <Field>
                <Label htmlFor="course-location">Ort</Label>
                <Select
                  id="course-location"
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                >
                  <option value="">Ort auswählen</option>
                  {courseLocationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="course-max">Plätze</Label>
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
              <Field className="min-w-0 md:col-span-2">
                <Label htmlFor="course-image">Bild</Label>
                <Input
                  id="course-image"
                  type="file"
                  accept={COURSE_IMAGE_ACCEPTED_TYPES.join(",")}
                  onChange={handleImageChange}
                  className="sr-only"
                />
                <label
                  htmlFor="course-image"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setImageDragActive(true);
                  }}
                  onDragLeave={() => setImageDragActive(false)}
                  onDrop={handleImageDrop}
                  className={cn(
                    "group grid min-w-0 cursor-pointer gap-4 rounded-lg border border-dashed bg-muted/45 p-3 transition hover:border-primary hover:bg-accent/60 sm:grid-cols-[minmax(120px,180px)_minmax(0,1fr)]",
                    imageDragActive
                      ? "border-primary bg-accent ring-2 ring-primary/15"
                      : "border-border",
                  )}
                >
                  <div className="relative min-w-0 overflow-hidden rounded-md border border-border bg-card">
                    <div className="aspect-[4/3]">
                      {displayedImageUrl ? (
                        <img
                          src={displayedImageUrl}
                          alt="Kursbild"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-primary">
                          <ImagePlus className="h-9 w-9" />
                        </div>
                      )}
                    </div>
                    {imageFile ? (
                      <Badge
                        tone="success"
                        className="absolute left-2 top-2 bg-emerald-50/95"
                      >
                        Neu
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex min-w-0 flex-col justify-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {imageFile
                          ? imageFile.name
                          : displayedImageUrl
                            ? "Aktuelles Bild"
                            : "Bild hinzufügen"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {imageFile
                          ? formatFileSize(imageFile.size)
                          : "JPG, PNG, WebP oder GIF bis 12 MB"}
                      </p>
                    </div>
                    <span className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition group-hover:bg-white">
                      <CloudUpload className="h-4 w-4 text-primary" />
                      {displayedImageUrl ? "Bild ändern" : "Bild auswählen"}
                    </span>
                  </div>
                </label>
                {imageFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedImageFile(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Auswahl entfernen
                  </Button>
                ) : null}
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

      <section
        className={cn(
          "grid",
          isManagementMode
            ? "grid-cols-1 gap-3"
            : viewMode === "grid"
            ? "gap-4 lg:grid-cols-2 xl:grid-cols-3"
            : "grid-cols-1 gap-2",
        )}
      >
        {isManagementMode
          ? managementCourseGroups.map((group) => {
              const representative = group.representative;
              const nextCourse =
                group.courses.find(
                  (course) => new Date(course.end_time).getTime() >= nowMs,
                ) ?? representative;
              const totalParticipants = group.courses.reduce(
                (sum, course) =>
                  sum + (registeredByCourse.get(course.id)?.length ?? 0),
                0,
              );
              const totalCapacity = group.courses.reduce(
                (sum, course) => sum + course.max_participants,
                0,
              );

              return (
                <Card key={group.key} className="min-w-0 overflow-hidden">
                  <div className="grid min-w-0 gap-4 p-4 md:grid-cols-[96px_minmax(0,1fr)] md:items-start">
                    {representative.image_url ? (
                      <div className="h-24 w-full overflow-hidden rounded-md bg-muted md:w-24">
                        <img
                          src={representative.image_url}
                          alt={representative.title}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center rounded-md bg-muted text-primary md:w-24">
                        <HeartPulse className="h-8 w-8" />
                      </div>
                    )}

                    <div className="min-w-0 space-y-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-semibold">
                            {representative.title}
                          </h2>
                          <Badge tone="info">
                            {group.courses.length}{" "}
                            {group.courses.length === 1
                              ? "Termin"
                              : "Termine"}
                          </Badge>
                          {!courseSettings.allow_same_course_multiple_registrations ? (
                            <Badge tone="warning">Einmalig buchbar</Badge>
                          ) : null}
                        </div>
                        {representative.category ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {representative.category}
                          </p>
                        ) : null}
                      </div>

                      {representative.description ? (
                        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {representative.description}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                          Nächster Termin: {formatDate(nextCourse.start_time)} ·{" "}
                          {formatTime(nextCourse.start_time)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          {totalParticipants}/{totalCapacity} Plätze belegt
                        </span>
                      </div>

                      <CourseParticipationBar
                        current={totalParticipants}
                        max={totalCapacity}
                        compact
                      />
                    </div>
                  </div>

                  <details
                    className="border-t border-border"
                    open={group.courses.length === 1}
                  >
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium transition hover:bg-muted/55">
                      Termine anzeigen ({group.courses.length})
                    </summary>
                    <div className="divide-y divide-border">
                      {group.courses.map((course) => {
                        const participants =
                          registeredByCourse.get(course.id) ?? [];
                        const free = Math.max(
                          0,
                          course.max_participants - participants.length,
                        );
                        const isPast =
                          new Date(course.end_time).getTime() < nowMs;
                        const effectiveStatus: CourseStatus =
                          course.status === "available" && isPast
                            ? "completed"
                            : course.status === "available" && free === 0
                              ? "full"
                              : course.status;
                        const canEditThis =
                          isAdmin ||
                          (isPhysio && course.provider_id === userId);

                        return (
                          <div
                            key={course.id}
                            className="grid gap-3 p-4 lg:grid-cols-[minmax(240px,1.2fr)_minmax(220px,0.8fr)_auto]"
                          >
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">
                                  {formatDate(course.start_time)} ·{" "}
                                  {formatTime(course.start_time)}-
                                  {formatTime(course.end_time)}
                                </p>
                                <Badge tone={statusTone[effectiveStatus]}>
                                  {statusLabel[effectiveStatus]}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="h-4 w-4 shrink-0" />
                                  {durationMinutes(course)} Min.
                                </span>
                                {course.location ? (
                                  <span className="inline-flex min-w-0 items-center gap-1.5">
                                    <MapPin className="h-4 w-4 shrink-0" />
                                    <span className="truncate">
                                      {course.location}
                                    </span>
                                  </span>
                                ) : null}
                                <span className="truncate">
                                  Anbieter:{" "}
                                  {profileById.get(course.provider_id) ??
                                    "Team"}
                                </span>
                              </div>
                            </div>

                            <CourseParticipationBar
                              current={participants.length}
                              max={course.max_participants}
                              compact
                            />

                            {canEditThis ? (
                              <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEdit(course)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Bearbeiten
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => duplicateCourse(course)}
                                  disabled={loading}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  Duplizieren
                                </Button>
                                {course.status !== "cancelled" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setCourseStatus(course, "cancelled")
                                    }
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
                                  Löschen
                                </Button>
                              </div>
                            ) : null}

                            {canEditThis && participants.length > 0 ? (
                              <details className="rounded-md border border-border px-3 py-2 text-sm lg:col-span-3">
                                <summary className="cursor-pointer font-medium">
                                  Teilnehmende ({participants.length})
                                </summary>
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {participants.map((registration) => (
                                    <label
                                      key={registration.id}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <span className="min-w-0 truncate">
                                        {profileById.get(
                                          registration.user_id,
                                        ) ?? registration.user_id}
                                      </span>
                                      <input
                                        type="checkbox"
                                        checked={
                                          registration.attendance_confirmed
                                        }
                                        onChange={() =>
                                          toggleAttendance(registration)
                                        }
                                      />
                                    </label>
                                  ))}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </Card>
              );
            })
          : null}

        {!isManagementMode ? visibleCourses.map((course) => {
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
            isManagementMode &&
            (isAdmin || (isPhysio && course.provider_id === userId));
          const canRegister =
            !isManagementMode && (!isPhysio || isAdmin);
          const cancellable =
            new Date(course.start_time).getTime() - nowMs >
            24 * 60 * 60 * 1000;
          const listLayout = !isManagementMode && viewMode === "list";
          const showRegistrationAction =
            canRegister &&
            course.status === "available" &&
            !isPast &&
            free > 0 &&
            !mine;
          const blockedReason = showRegistrationAction
            ? registrationBlockReason(course)
            : null;

          if (listLayout) {
            return (
              <Card key={course.id} className="min-w-0 overflow-hidden">
                <div className="grid min-w-0 gap-3 p-3 md:grid-cols-[76px_minmax(180px,1.2fr)_minmax(360px,2fr)_auto] md:items-center">
                  {course.image_url ? (
                    <div className="h-20 w-full overflow-hidden rounded-md bg-muted md:h-14 md:w-[76px]">
                      <img
                        src={course.image_url}
                        alt={course.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 w-full items-center justify-center rounded-md bg-muted md:h-14 md:w-[76px]">
                      <HeartPulse className="h-6 w-6 text-primary/70" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-base font-semibold">
                        {course.title}
                      </h2>
                      {mine ? <Badge tone="info">Gebucht</Badge> : null}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {course.category ? (
                        <span className="truncate font-medium text-foreground/70">
                          {course.category}
                        </span>
                      ) : null}
                      {course.description ? (
                        <span className="line-clamp-1 min-w-0">
                          {course.description}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        {formatDate(course.start_time)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {formatTime(course.start_time)}-
                        {formatTime(course.end_time)} · {durationMinutes(course)} Min.
                      </span>
                      {course.location ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{course.location}</span>
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        {participants.length}/{course.max_participants} · {free} frei
                      </span>
                      <span className="truncate">
                        Anbieter: {profileById.get(course.provider_id) ?? "Team"}
                      </span>
                    </div>
                    <CourseParticipationBar
                      current={participants.length}
                      max={course.max_participants}
                      compact
                    />
                  </div>

                  <div className="flex shrink-0 items-center justify-start gap-2 md:justify-end">
                    <Badge tone={statusTone[effectiveStatus]}>
                      {statusLabel[effectiveStatus]}
                    </Badge>
                    {showRegistrationAction ? (
                      <Button
                        type="button"
                        variant={blockedReason ? "outline" : "primary"}
                        size="sm"
                        className="h-8 px-3"
                        onClick={() =>
                          blockedReason
                            ? setMessage(blockedReason)
                            : register(course)
                        }
                        disabled={loading}
                      >
                        {blockedReason ? "Nicht möglich" : "Anmelden"}
                      </Button>
                    ) : null}
                    {canRegister && mine ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
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
                  </div>
                </div>
              </Card>
            );
          }

          return (
            <Card
              key={course.id}
              className={cn(
                "overflow-hidden",
                listLayout ? "grid md:grid-cols-[220px_minmax(0,1fr)]" : "flex flex-col",
              )}
            >
              {course.image_url ? (
                <div
                  className={cn(
                    "bg-muted",
                    listLayout ? "aspect-[16/10] md:aspect-auto" : "aspect-[16/9]",
                  )}
                >
                  <img
                    src={course.image_url}
                    alt={course.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className={cn(
                    "flex items-center justify-center bg-muted",
                    listLayout ? "aspect-[16/10] md:aspect-auto" : "aspect-[16/9]",
                  )}
                >
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

                <CourseParticipationBar
                  current={participants.length}
                  max={course.max_participants}
                />

                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {showRegistrationAction ? (
                    <Button
                      type="button"
                      variant={blockedReason ? "outline" : "primary"}
                      size="sm"
                      onClick={() =>
                        blockedReason
                          ? setMessage(blockedReason)
                          : register(course)
                      }
                      disabled={loading}
                    >
                      {blockedReason ? "Nicht möglich" : "Anmelden"}
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => duplicateCourse(course)}
                        disabled={loading}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Duplizieren
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
                        Löschen
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
        }) : null}

        {(isManagementMode
          ? managementCourseGroups.length === 0
          : visibleCourses.length === 0) ? (
          <Card
            className={cn(
              "p-8 text-center text-sm text-muted-foreground",
              !isManagementMode && viewMode === "grid"
                ? "lg:col-span-2 xl:col-span-3"
                : "",
            )}
          >
            Keine Kurse gefunden.
          </Card>
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(pendingCourseUnregister)}
        title="Kursanmeldung stornieren?"
        description="Deine Anmeldung wird storniert und der Platz wird wieder freigegeben."
        detail={
          pendingCourseUnregister ? (
            <span className="block">
              {pendingCourseUnregister.title}
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {formatDate(pendingCourseUnregister.start_time)} ·{" "}
                {formatTime(pendingCourseUnregister.start_time)}-
                {formatTime(pendingCourseUnregister.end_time)}
              </span>
            </span>
          ) : null
        }
        confirmLabel="Anmeldung stornieren"
        onCancel={() => setPendingCourseUnregister(null)}
        onConfirm={confirmUnregister}
      />

      <ConfirmDialog
        open={Boolean(pendingCourseRemoval)}
        title="Kurs löschen?"
        description="Dieser Kurs wird dauerhaft aus der Kursübersicht entfernt."
        detail={
          pendingCourseRemoval ? (
            <span className="block">
              {pendingCourseRemoval.title}
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {formatDate(pendingCourseRemoval.start_time)} ·{" "}
                {formatTime(pendingCourseRemoval.start_time)}-
                {formatTime(pendingCourseRemoval.end_time)}
              </span>
            </span>
          ) : null
        }
        confirmLabel="Kurs löschen"
        onCancel={() => setPendingCourseRemoval(null)}
        onConfirm={confirmDeleteCourse}
      />
    </div>
  );
}
