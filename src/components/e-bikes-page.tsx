"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bike,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Copy,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
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
import type { Database } from "@/lib/database.types";
import {
  EBIKE_IMAGE_ACCEPTED_TYPES,
  EBIKE_IMAGE_MAX_BYTES,
} from "@/lib/ebike-images";
import {
  normalizeEBikeAvailability,
  shortTime,
  WEEKDAY_LABELS,
  type EBikeAvailabilityWindow,
} from "@/lib/e-bike-availability";
import {
  needsEBikeSafetyConfirmation,
  normalizeEBikeReservationSettings,
  type EBikeReservationSettings,
} from "@/lib/e-bike-reservation-settings";
import { formatDateTime } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type EBike = Database["public"]["Tables"]["ebikes"]["Row"];
type Reservation = Database["public"]["Tables"]["ebike_reservations"]["Row"];
type ReservationInsert =
  Database["public"]["Tables"]["ebike_reservations"]["Insert"];
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email"
>;
type EBikeStatus = Database["public"]["Enums"]["ebike_status"];

const statusLabel: Record<EBikeStatus, string> = {
  available: "Verfügbar",
  reserved: "Reserviert",
  in_use: "Unterwegs",
  maintenance: "Wartung",
  unavailable: "Nicht verfügbar",
};

const statusTone: Record<EBikeStatus, "neutral" | "success" | "warning" | "info"> = {
  available: "success",
  reserved: "warning",
  in_use: "info",
  maintenance: "warning",
  unavailable: "neutral",
};

const editableStatuses: EBikeStatus[] = [
  "available",
  "maintenance",
  "unavailable",
];

const sectionItems = [
  {
    href: "/e-bikes/reservierungen",
    label: "Reservierungen",
    icon: CalendarDays,
  },
  {
    href: "/e-bikes/fuhrpark",
    label: "Fuhrpark",
    icon: Bike,
  },
];

const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const CALENDAR_WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const EBIKE_RESERVATION_LEAD_MINUTES = 10;
const EBIKE_RESERVATION_MIN_DURATION_MINUTES = 15;
const EBIKE_RESERVATION_TIME_STEP_MINUTES = 5;
const EBIKE_RESERVATION_DURATION_PRESETS = [30, 60, 90, 120];

type ReservationRangeDragMode = "start" | "end" | "range" | "track";

type BikeForm = {
  id?: string;
  name: string;
  model: string;
  frame_size: string;
  status: EBikeStatus;
  image_url: string;
  notes: string;
};

function emptyBikeForm(): BikeForm {
  return {
    name: "",
    model: "",
    frame_size: "",
    status: "available",
    image_url: "",
    notes: "",
  };
}

function fromBike(bike: EBike): BikeForm {
  return {
    id: bike.id,
    name: bike.name,
    model: bike.model ?? "",
    frame_size: bike.frame_size ?? "",
    status: editableStatuses.includes(bike.status) ? bike.status : "available",
    image_url: bike.image_url ?? "",
    notes: bike.notes ?? "",
  };
}

function isReservableBike(bike: EBike) {
  return (
    bike.active &&
    !["maintenance", "unavailable", "in_use"].includes(bike.status)
  );
}

function bikeDetails(bike: EBike) {
  return [bike.model, bike.frame_size].filter(Boolean).join(" · ");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromInputValue(value: string) {
  return new Date(`${value}T12:00`);
}

function addDaysToDateInput(value: string, days: number) {
  const date = dateFromInputValue(value);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function calendarMonthGrid(monthDate: Date) {
  const firstDay = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth(),
    1,
    12,
  );
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatDateButtonLabel(date: Date) {
  return date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toDateTimeLocalValue(date: string, minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${date}T${hours}:${mins}`;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapMinute(value: number) {
  return (
    Math.round(value / EBIKE_RESERVATION_TIME_STEP_MINUTES) *
    EBIKE_RESERVATION_TIME_STEP_MINUTES
  );
}

function minutesFromDate(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest > 0 ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
}

function minutesFromDateTimeLocal(value: string) {
  return minutesFromDate(new Date(value));
}

function localDateKey(date: Date) {
  return toDateInputValue(date);
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function reservationRangeInMinutes(
  reservation: Reservation,
  startMinute: number,
  endMinute: number,
) {
  const start = new Date(reservation.start_time);
  const end = new Date(reservation.end_time);
  return {
    start: Math.max(startMinute, minutesFromDate(start)),
    end: Math.min(endMinute, minutesFromDate(end)),
  };
}

function EBikesSectionNav() {
  const pathname = usePathname();

  return (
    <div className="inline-flex rounded-md border border-border bg-card p-1">
      {sectionItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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

export function EBikeReservationsPage({
  initialBikes,
  initialReservations,
  initialProfiles,
  initialAvailability,
  initialReservationSettings,
  initialSelectedBikeId,
  isAdmin,
  userId,
}: {
  initialBikes: EBike[];
  initialReservations: Reservation[];
  initialProfiles: Profile[];
  initialAvailability: EBikeAvailabilityWindow[];
  initialReservationSettings: EBikeReservationSettings;
  initialSelectedBikeId?: string;
  isAdmin: boolean;
  userId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [bikes, setBikes] = useState(initialBikes);
  const [reservations, setReservations] = useState(initialReservations);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [availability, setAvailability] = useState(() =>
    normalizeEBikeAvailability(initialAvailability),
  );
  const [reservationSettings, setReservationSettings] = useState(() =>
    normalizeEBikeReservationSettings(initialReservationSettings),
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [reservationCalendarOpen, setReservationCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    dateFromInputValue(today),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBikeId, setSelectedBikeId] = useState(
    initialSelectedBikeId ?? "",
  );
  const [purpose, setPurpose] = useState("");
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [pendingReservation, setPendingReservation] =
    useState<ReservationInsert | null>(null);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [range, setRange] = useState(() => {
    const dayAvailability =
      normalizeEBikeAvailability(initialAvailability)[new Date().getDay()];
    const start = dayAvailability.active
      ? minutesFromTime(dayAvailability.start_time)
      : 8 * 60;
    return {
      start: toDateTimeLocalValue(today, start),
      end: toDateTimeLocalValue(today, start + 60),
    };
  });
  const [nowMs, setNowMs] = useState(0);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const modalTimeTrackRef = useRef<HTMLDivElement | null>(null);
  const lastTimelineAutoScrollKeyRef = useRef<string | null>(null);

  const selectedDateObject = useMemo(
    () => dateFromInputValue(selectedDate),
    [selectedDate],
  );
  const calendarDays = useMemo(
    () => calendarMonthGrid(calendarMonth),
    [calendarMonth],
  );
  const selectedDateLabel = useMemo(
    () => formatDateButtonLabel(selectedDateObject),
    [selectedDateObject],
  );
  const previousDateDisabled = selectedDate <= today;
  const dayOfWeek = selectedDateObject.getDay();
  const dayAvailability = availability[dayOfWeek];
  const availabilityStart = dayAvailability.active
    ? minutesFromTime(dayAvailability.start_time)
    : 8 * 60;
  const availabilityEnd = dayAvailability.active
    ? minutesFromTime(dayAvailability.end_time)
    : 18 * 60;
  const selectedDateIsToday = selectedDate === today;
  const currentTime = nowMs > 0 ? new Date(nowMs) : null;
  const currentMinute =
    selectedDateIsToday && currentTime ? minutesFromDate(currentTime) : null;
  const earliestBookableMinute =
    currentMinute === null
      ? availabilityStart
      : currentMinute + EBIKE_RESERVATION_LEAD_MINUTES;
  const timelineStart = availabilityStart;
  const timelineEnd = Math.max(availabilityEnd, timelineStart + 60);
  const timelineDuration = timelineEnd - timelineStart;
  const timelineMinWidth = Math.max(760, timelineDuration * 3.2);
  const visibleTimelineStart =
    selectedDateIsToday && currentMinute !== null
      ? Math.min(timelineEnd, Math.max(timelineStart, currentMinute))
      : timelineStart;
  const effectiveBookableStart = selectedDateIsToday
    ? Math.max(availabilityStart, earliestBookableMinute)
    : availabilityStart;
  const currentTimeLineLeft =
    currentMinute !== null &&
    currentMinute >= timelineStart &&
    currentMinute <= timelineEnd
      ? ((currentMinute - timelineStart) / timelineDuration) * 100
      : null;
  const nonBookableUntilMinute =
    selectedDateIsToday && currentTime
      ? Math.min(
          timelineEnd,
          currentMinute !== null && currentMinute >= availabilityEnd
            ? timelineEnd
            : Math.max(timelineStart, effectiveBookableStart),
        )
      : null;
  const nonBookableWidth =
    nonBookableUntilMinute !== null
      ? ((nonBookableUntilMinute - timelineStart) / timelineDuration) * 100
      : null;
  const pastDisplayEnd =
    selectedDateIsToday && currentMinute !== null
      ? Math.min(currentMinute, availabilityEnd)
      : null;

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

  const timelineBikes = useMemo(() => {
    return bikes.filter(
      (bike) =>
        bike.active && !["maintenance", "unavailable"].includes(bike.status),
    );
  }, [bikes]);

  const selectedDayReservations = useMemo(() => {
    return reservations
      .filter(
        (reservation) =>
          reservation.status === "active" &&
          (localDateKey(new Date(reservation.start_time)) === selectedDate ||
            localDateKey(new Date(reservation.end_time)) === selectedDate),
      )
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
  }, [reservations, selectedDate]);

  const myUpcomingReservations = useMemo(() => {
    return reservations
      .filter(
        (reservation) =>
          reservation.status === "active" &&
          reservation.user_id === userId &&
          new Date(reservation.end_time).getTime() >= nowMs,
      )
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
  }, [nowMs, reservations, userId]);

  const selectedBike = bikes.find((bike) => bike.id === selectedBikeId);
  const safetyConfirmationRequired =
    needsEBikeSafetyConfirmation(reservationSettings);
  const safetyConfirmationText =
    reservationSettings.safety_confirmation_text.trim();
  const pendingSafetyConfirmationText =
    pendingReservation?.safety_confirmation_text?.trim() ||
    safetyConfirmationText;
  const modalStartMinute = minutesFromDateTimeLocal(range.start);
  const modalEndMinute = minutesFromDateTimeLocal(range.end);
  const modalDurationMinutes = Math.max(0, modalEndMinute - modalStartMinute);
  const modalTimelineDuration = Math.max(1, availabilityEnd - availabilityStart);
  const modalSelectionStart = Math.max(
    availabilityStart,
    Math.min(availabilityEnd, modalStartMinute),
  );
  const modalSelectionEnd = Math.max(
    modalSelectionStart,
    Math.min(availabilityEnd, modalEndMinute),
  );
  const modalSelectionLeft =
    dayAvailability.active
      ? ((modalSelectionStart - availabilityStart) / modalTimelineDuration) *
        100
      : 0;
  const modalSelectionWidth =
    dayAvailability.active
      ? Math.max(
          1.5,
          ((modalSelectionEnd - modalSelectionStart) /
            modalTimelineDuration) *
            100,
        )
      : 0;
  const modalCanSelectTime =
    dayAvailability.active &&
    effectiveBookableStart + EBIKE_RESERVATION_MIN_DURATION_MINUTES <=
      availabilityEnd;
  const modalStartBoundary = modalCanSelectTime
    ? effectiveBookableStart
    : availabilityStart;
  const modalEndBoundary = dayAvailability.active
    ? availabilityEnd
    : modalStartBoundary + 60;
  const modalDisabledUntil = dayAvailability.active
    ? Math.min(availabilityEnd, effectiveBookableStart)
    : availabilityStart;
  const modalDisabledWidth =
    dayAvailability.active && modalDisabledUntil > availabilityStart
      ? ((modalDisabledUntil - availabilityStart) / modalTimelineDuration) *
        100
      : 0;
  const modalBusyRanges =
    selectedBikeId && dayAvailability.active
      ? occupiedRangesForBike(selectedBikeId, availabilityStart, availabilityEnd)
      : [];
  const modalHasConflict = modalBusyRanges.some(
    (item) => modalStartMinute < item.end && modalEndMinute > item.start,
  );
  const hourTicks: number[] = [];

  for (
    let minute = Math.ceil(timelineStart / 60) * 60;
    minute <= timelineEnd;
    minute += 60
  ) {
    hourTicks.push(minute);
  }

  const modalHourTicks = hourTicks.filter(
    (minute) => minute >= availabilityStart && minute <= availabilityEnd,
  );

  const reload = useCallback(async () => {
    const [
      bikeResult,
      reservationResult,
      profileResult,
      availabilityResult,
      reservationSettingsResult,
    ] = await Promise.all([
      supabase.from("ebikes").select("*").order("name"),
      supabase
        .from("ebike_reservations")
        .select("*")
        .order("start_time", { ascending: true }),
      isAdmin
        ? supabase.from("profiles").select("id, full_name, email")
        : Promise.resolve({ data: [] }),
      supabase
        .from("ebike_availability_windows")
        .select("*")
        .order("day_of_week"),
      supabase
        .from("ebike_reservation_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle(),
    ]);

    setBikes((bikeResult.data ?? []) as EBike[]);
    setReservations((reservationResult.data ?? []) as Reservation[]);
    setProfiles((profileResult.data ?? []) as Profile[]);
    setAvailability(
      normalizeEBikeAvailability(
        (availabilityResult.data ?? []) as EBikeAvailabilityWindow[],
      ),
    );
    setReservationSettings(
      normalizeEBikeReservationSettings(
        reservationSettingsResult.data as EBikeReservationSettings | null,
      ),
    );
  }, [isAdmin, supabase]);

  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now());
    const timeout = window.setTimeout(refreshNow, 0);
    const interval = window.setInterval(refreshNow, 60_000);

    const channel = supabase
      .channel("ullis-ebike-reservations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ebikes" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ebike_reservations" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ebike_availability_windows" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ebike_reservation_settings" },
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
    if (selectedDateIsToday && currentMinute === null) return;

    const scrollElement = timelineScrollRef.current;
    if (!scrollElement) return;

    const scrollKey = `${selectedDate}-${timelineStart}-${timelineEnd}-${timelineBikes.length}`;
    if (lastTimelineAutoScrollKeyRef.current === scrollKey) return;

    const timelineAreaWidth = Math.max(0, scrollElement.scrollWidth - 220);
    const scrollTarget =
      ((visibleTimelineStart - timelineStart) / timelineDuration) *
      timelineAreaWidth;

    scrollElement.scrollLeft = Math.max(
      0,
      Math.min(scrollTarget, scrollElement.scrollWidth - scrollElement.clientWidth),
    );
    lastTimelineAutoScrollKeyRef.current = scrollKey;
  }, [
    currentMinute,
    selectedDate,
    selectedDateIsToday,
    timelineBikes.length,
    timelineDuration,
    timelineEnd,
    timelineStart,
    visibleTimelineStart,
  ]);

  function reservationsForBike(bikeId: string) {
    return selectedDayReservations.filter(
      (reservation) => reservation.ebike_id === bikeId,
    );
  }

  function occupiedRangesForBike(
    bikeId: string,
    startMinute: number,
    endMinute: number,
  ) {
    const busyRanges = reservationsForBike(bikeId)
      .map((reservation) =>
        reservationRangeInMinutes(reservation, startMinute, endMinute),
      )
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start);
    const mergedBusyRanges: Array<{ start: number; end: number }> = [];

    busyRanges.forEach((rangeItem) => {
      const last = mergedBusyRanges.at(-1);

      if (!last || rangeItem.start > last.end) {
        mergedBusyRanges.push({ ...rangeItem });
        return;
      }

      last.end = Math.max(last.end, rangeItem.end);
    });

    return mergedBusyRanges;
  }

  function freeSlotsForBike(bikeId: string) {
    if (!dayAvailability.active) return [];

    const mergedBusyRanges = occupiedRangesForBike(
      bikeId,
      availabilityStart,
      availabilityEnd,
    );

    const slots: Array<{ start: number; end: number }> = [];
    let cursor = effectiveBookableStart;

    mergedBusyRanges.forEach((rangeItem) => {
      if (rangeItem.start - cursor >= 30) {
        slots.push({ start: cursor, end: rangeItem.start });
      }
      cursor = Math.max(cursor, rangeItem.end);
    });

    if (availabilityEnd - cursor >= 30) {
      slots.push({ start: cursor, end: availabilityEnd });
    }

    return slots;
  }

  function pastUnoccupiedSlotsForBike(bikeId: string) {
    if (!dayAvailability.active || pastDisplayEnd === null) return [];
    if (pastDisplayEnd <= availabilityStart) return [];

    const mergedBusyRanges = occupiedRangesForBike(
      bikeId,
      availabilityStart,
      pastDisplayEnd,
    );
    const slots: Array<{ start: number; end: number }> = [];
    let cursor = availabilityStart;

    mergedBusyRanges.forEach((rangeItem) => {
      if (rangeItem.start - cursor >= 30) {
        slots.push({ start: cursor, end: rangeItem.start });
      }
      cursor = Math.max(cursor, rangeItem.end);
    });

    if (pastDisplayEnd - cursor >= 30) {
      slots.push({ start: cursor, end: pastDisplayEnd });
    }

    return slots;
  }

  function openReservationModal(bikeId?: string, start?: number, end?: number) {
    const nextBikeId = bikeId || selectedBikeId || timelineBikes[0]?.id || "";
    const defaultStart = dayAvailability.active ? effectiveBookableStart : 8 * 60;
    const nextStart = start ?? defaultStart;
    const nextEnd = Math.min(
      end ?? nextStart + 60,
      dayAvailability.active ? availabilityEnd : nextStart + 60,
    );

    setSelectedBikeId(nextBikeId);
    setRange({
      start: toDateTimeLocalValue(selectedDate, nextStart),
      end: toDateTimeLocalValue(selectedDate, Math.max(nextStart + 30, nextEnd)),
    });
    setPurpose("");
    setPendingReservation(null);
    setSafetyAcknowledged(false);
    setCalendarOpen(false);
    setReservationCalendarOpen(false);
    setReservationModalOpen(true);
    setMessage(null);
  }

  function setReservationMinutes(nextStart: number, nextEnd: number) {
    if (!dayAvailability.active || !modalCanSelectTime) return;

    const duration = Math.max(
      EBIKE_RESERVATION_MIN_DURATION_MINUTES,
      nextEnd - nextStart,
    );
    const startMax = Math.max(
      modalStartBoundary,
      modalEndBoundary - EBIKE_RESERVATION_MIN_DURATION_MINUTES,
    );
    let safeStart = clampNumber(
      snapMinute(nextStart),
      modalStartBoundary,
      startMax,
    );
    let safeEnd = clampNumber(
      snapMinute(nextEnd),
      safeStart + EBIKE_RESERVATION_MIN_DURATION_MINUTES,
      modalEndBoundary,
    );

    if (safeEnd - safeStart < EBIKE_RESERVATION_MIN_DURATION_MINUTES) {
      safeEnd = Math.min(
        modalEndBoundary,
        safeStart + EBIKE_RESERVATION_MIN_DURATION_MINUTES,
      );
    }

    if (duration > safeEnd - safeStart && safeEnd === modalEndBoundary) {
      safeStart = Math.max(modalStartBoundary, safeEnd - duration);
    }

    setRange({
      start: toDateTimeLocalValue(selectedDate, safeStart),
      end: toDateTimeLocalValue(selectedDate, safeEnd),
    });
  }

  function moveReservationRange(deltaMinutes: number) {
    if (!modalCanSelectTime) return;

    const duration = Math.max(
      EBIKE_RESERVATION_MIN_DURATION_MINUTES,
      modalEndMinute - modalStartMinute,
    );
    const nextStart = clampNumber(
      modalStartMinute + deltaMinutes,
      modalStartBoundary,
      Math.max(modalStartBoundary, modalEndBoundary - duration),
    );

    setReservationMinutes(nextStart, nextStart + duration);
  }

  function setReservationDuration(durationMinutes: number) {
    setReservationMinutes(
      modalStartMinute,
      modalStartMinute + durationMinutes,
    );
  }

  function minuteFromTrackPointer(clientX: number) {
    const track = modalTimeTrackRef.current;
    if (!track || !dayAvailability.active) return modalStartBoundary;

    const rect = track.getBoundingClientRect();
    const percent = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    return snapMinute(
      availabilityStart + percent * (availabilityEnd - availabilityStart),
    );
  }

  function handleTimeRangePointerDown(
    event: ReactPointerEvent,
    mode: ReservationRangeDragMode,
  ) {
    if (!modalCanSelectTime) return;

    event.preventDefault();
    event.stopPropagation();

    const pointerStartMinute = minuteFromTrackPointer(event.clientX);
    const originalStart = modalStartMinute;
    const originalEnd = modalEndMinute;
    const originalDuration = Math.max(
      EBIKE_RESERVATION_MIN_DURATION_MINUTES,
      originalEnd - originalStart,
    );

    const applyPointer = (clientX: number) => {
      const pointerMinute = minuteFromTrackPointer(clientX);

      if (mode === "start") {
        setReservationMinutes(pointerMinute, originalEnd);
        return;
      }

      if (mode === "end") {
        setReservationMinutes(originalStart, pointerMinute);
        return;
      }

      const nextStart =
        mode === "track"
          ? pointerMinute
          : originalStart + (pointerMinute - pointerStartMinute);

      setReservationMinutes(nextStart, nextStart + originalDuration);
    };

    applyPointer(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      applyPointer(moveEvent.clientX);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function selectSlot(bikeId: string, start: number, end: number) {
    const nextStart = Math.max(start, effectiveBookableStart);
    const defaultEnd = Math.min(end, nextStart + 60);
    setSelectedBikeId(bikeId);
    setRange({
      start: toDateTimeLocalValue(selectedDate, nextStart),
      end: toDateTimeLocalValue(selectedDate, defaultEnd),
    });
    setPurpose("");
    setCalendarOpen(false);
    setReservationCalendarOpen(false);
    setReservationModalOpen(true);
    setMessage(null);
  }

  function handleDateChange(nextDate: string) {
    const safeDate = nextDate < today ? today : nextDate;
    const nextAvailability =
      availability[dateFromInputValue(safeDate).getDay()];
    const nextAvailabilityStart = nextAvailability.active
      ? minutesFromTime(nextAvailability.start_time)
      : 8 * 60;
    const nextCurrentMinute =
      safeDate === today && nowMs > 0 ? minutesFromDate(new Date(nowMs)) : null;
    const nextStart =
      nextCurrentMinute === null
        ? nextAvailabilityStart
        : Math.max(
            nextAvailabilityStart,
            nextCurrentMinute + EBIKE_RESERVATION_LEAD_MINUTES,
          );

    lastTimelineAutoScrollKeyRef.current = null;
    setSelectedDate(safeDate);
    setCalendarMonth(dateFromInputValue(safeDate));
    setReservationCalendarOpen(false);
    setRange({
      start: toDateTimeLocalValue(safeDate, nextStart),
      end: toDateTimeLocalValue(safeDate, nextStart + 60),
    });
    setMessage(null);
  }

  function shiftSelectedDate(days: number) {
    handleDateChange(addDaysToDateInput(selectedDate, days));
  }

  function shiftCalendarMonth(months: number) {
    setCalendarMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + months, 1);
      return next;
    });
  }

  function closeReservationModal() {
    setReservationModalOpen(false);
    setPendingReservation(null);
    setSafetyAcknowledged(false);
    setReservationCalendarOpen(false);
  }

  async function createReservation(payload: ReservationInsert) {
    setLoading(true);

    const { error } = await supabase.from("ebike_reservations").insert(payload);

    setLoading(false);

    if (error) {
      setPendingReservation(null);
      setSafetyAcknowledged(false);
      setMessage(error.message);
      return;
    }

    setPendingReservation(null);
    setSafetyAcknowledged(false);
    setReservationModalOpen(false);
    setPurpose("");
    setRange({
      start: toDateTimeLocalValue(selectedDate, availabilityStart),
      end: toDateTimeLocalValue(
        selectedDate,
        Math.min(availabilityEnd, availabilityStart + 60),
      ),
    });
    await reload();
  }

  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!selectedBike) {
      setMessage("Bitte ein E-Bike auswählen.");
      return;
    }

    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    const reservationDay = availability[startDate.getDay()];
    const startMinutes = minutesFromDate(startDate);
    const endMinutes = minutesFromDate(endDate);

    if (endDate <= startDate) {
      setMessage("Endzeit muss nach Startzeit liegen.");
      return;
    }

    if (localDateKey(startDate) !== localDateKey(endDate)) {
      setMessage("Reservierungen müssen innerhalb eines Tages liegen.");
      return;
    }

    if (
      !reservationDay.active ||
      startMinutes < minutesFromTime(reservationDay.start_time) ||
      endMinutes > minutesFromTime(reservationDay.end_time)
    ) {
      setMessage("Die Auswahl liegt außerhalb der freigegebenen E-Bike-Zeiten.");
      return;
    }

    if (
      selectedDateIsToday &&
      nowMs > 0 &&
      startMinutes < earliestBookableMinute
    ) {
      setMessage(
        `Reservierungen sind frühestens ${EBIKE_RESERVATION_LEAD_MINUTES} Minuten in der Zukunft möglich.`,
      );
      return;
    }

    if (endDate.getTime() - startDate.getTime() > 14 * 24 * 60 * 60 * 1000) {
      setMessage("Maximale Reservierungsdauer beträgt 14 Tage.");
      return;
    }

    const hasConflict = reservations.some((reservation) => {
      if (
        reservation.status !== "active" ||
        reservation.ebike_id !== selectedBike.id
      ) {
        return false;
      }

      return overlaps(
        startDate,
        endDate,
        new Date(reservation.start_time),
        new Date(reservation.end_time),
      );
    });

    if (hasConflict) {
      setMessage("Dieses E-Bike ist im gewählten Zeitraum bereits reserviert.");
      return;
    }

    const payload: ReservationInsert = {
      ebike_id: selectedBike.id,
      user_id: userId,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      purpose: purpose.trim() || null,
    };

    if (safetyConfirmationRequired) {
      setSafetyAcknowledged(false);
      setPendingReservation({
        ...payload,
        safety_confirmation_text: reservationSettings.safety_confirmation_text,
      });
      return;
    }

    await createReservation(payload);
  }

  async function confirmSafetyAndReserve() {
    if (!pendingReservation || !safetyAcknowledged) return;

    await createReservation({
      ...pendingReservation,
      safety_confirmed_at: new Date().toISOString(),
      safety_confirmation_text:
        pendingReservation.safety_confirmation_text ??
        reservationSettings.safety_confirmation_text,
    });
  }

  async function cancelReservation(reservation: Reservation) {
    if (!window.confirm("Reservierung stornieren?")) return;

    const { error } = await supabase
      .from("ebike_reservations")
      .update({ status: "cancelled" })
      .eq("id", reservation.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="E-Bikes"
        eyebrow="Reservierungen"
        action={<EBikesSectionNav />}
      />

      {message && !reservationModalOpen && !pendingReservation ? (
        <Notice tone="danger">{message}</Notice>
      ) : null}

      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Meine Reservierungen</h2>
          <Button type="button" size="sm" onClick={() => openReservationModal()}>
            <Plus className="h-4 w-4" />
            Reservierung
          </Button>
        </div>
        {myUpcomingReservations.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {myUpcomingReservations.slice(0, 6).map((reservation) => {
              const bikeItem = bikes.find(
                (item) => item.id === reservation.ebike_id,
              );

              return (
                <div
                  key={reservation.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{bikeItem?.name ?? "E-Bike"}</p>
                      <p className="text-muted-foreground">
                        {formatDateTime(reservation.start_time)} bis{" "}
                        {formatDateTime(reservation.end_time)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => cancelReservation(reservation)}
                      title="Stornieren"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Keine kommenden Reservierungen.
          </p>
        )}
      </Card>

      <Card className="overflow-visible">
        <div className="relative z-40 flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span>{WEEKDAY_LABELS[dayOfWeek]}</span>
            {dayAvailability.active ? (
              <Badge tone="success">
                {shortTime(dayAvailability.start_time)} -{" "}
                {shortTime(dayAvailability.end_time)}
              </Badge>
            ) : (
              <Badge tone="neutral">Nicht verfügbar</Badge>
            )}
            {currentMinute !== null ? (
              <Badge tone="info">Jetzt {formatMinutes(currentMinute)}</Badge>
            ) : null}
          </div>
          <div className="relative w-full sm:w-auto">
            <Label>Datum</Label>
            <div className="mt-1 flex w-full overflow-hidden rounded-md border border-border bg-card shadow-sm sm:w-auto">
              <button
                type="button"
                onClick={() => shiftSelectedDate(-1)}
                disabled={previousDateDisabled}
                className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-border text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                title="Vorheriger Tag"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalendarMonth(selectedDateObject);
                  setCalendarOpen((open) => !open);
                }}
                className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 px-3 text-sm font-medium transition hover:bg-muted sm:min-w-[220px]"
              >
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="truncate">{selectedDateLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => shiftSelectedDate(1)}
                className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                title="Nächster Tag"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {calendarOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 shadow-xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => shiftCalendarMonth(-1)}
                    title="Vorheriger Monat"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <p className="text-sm font-semibold">
                    {MONTH_LABELS[calendarMonth.getMonth()]}{" "}
                    {calendarMonth.getFullYear()}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => shiftCalendarMonth(1)}
                    title="Nächster Monat"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                  {CALENDAR_WEEKDAY_LABELS.map((label) => (
                    <span key={label} className="py-1">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarDays.map((date) => {
                    const dateValue = toDateInputValue(date);
                    const disabled = dateValue < today;
                    const selected = dateValue === selectedDate;
                    const currentMonth =
                      date.getMonth() === calendarMonth.getMonth();

                    return (
                      <button
                        key={dateValue}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          handleDateChange(dateValue);
                          setCalendarOpen(false);
                        }}
                        className={cn(
                          "flex h-9 items-center justify-center rounded-md text-sm font-medium transition",
                          currentMonth
                            ? "text-foreground"
                            : "text-muted-foreground/55",
                          selected
                            ? "bg-primary text-primary-foreground hover:bg-primary"
                            : "hover:bg-muted",
                          dateValue === today && !selected
                            ? "ring-1 ring-primary/30"
                            : "",
                          disabled
                            ? "cursor-not-allowed text-muted-foreground/30 hover:bg-transparent"
                            : "",
                        )}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div ref={timelineScrollRef} className="overflow-x-auto">
          <div
            className="min-w-[920px]"
            style={{
              width: `max(100%, ${timelineMinWidth + 220}px)`,
            }}
          >
            <div className="grid grid-cols-[220px_minmax(0,1fr)] border-b border-border bg-muted/45">
              <div className="sticky left-0 z-30 border-r border-border bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground shadow-[8px_0_16px_-14px_rgba(0,0,0,0.45)]">
                E-Bike
              </div>
              <div className="relative h-12">
                {nonBookableWidth !== null ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 bg-muted/65"
                    style={{ width: `${nonBookableWidth}%` }}
                  />
                ) : null}
                {hourTicks.map((minute) => (
                  <div
                    key={minute}
                    className="absolute top-0 h-full border-l border-border/70 px-2 pt-3 text-sm font-semibold text-muted-foreground"
                    style={{
                      left: `${((minute - timelineStart) / timelineDuration) * 100}%`,
                    }}
                  >
                    {formatMinutes(minute)}
                  </div>
                ))}
                {currentTimeLineLeft !== null && currentMinute !== null ? (
                  <div
                    className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-primary"
                    style={{ left: `${currentTimeLineLeft}%` }}
                  />
                ) : null}
              </div>
            </div>

            {timelineBikes.map((bikeItem) => {
              const bikeReservations = reservationsForBike(bikeItem.id);
              const freeSlots = freeSlotsForBike(bikeItem.id);
              const pastUnoccupiedSlots = pastUnoccupiedSlotsForBike(
                bikeItem.id,
              );

              return (
                <div
                  key={bikeItem.id}
                  className="grid min-h-[112px] grid-cols-[220px_minmax(0,1fr)] border-b border-border last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedBikeId(bikeItem.id)}
                    className={cn(
                      "sticky left-0 z-30 border-r border-border bg-card px-4 py-4 text-left shadow-[8px_0_16px_-14px_rgba(0,0,0,0.45)] transition hover:bg-muted/60",
                      selectedBikeId === bikeItem.id ? "bg-accent/70" : "",
                    )}
                  >
                    <p className="truncate font-semibold">{bikeItem.name}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {bikeDetails(bikeItem) || statusLabel[bikeItem.status]}
                    </p>
                  </button>

                  <div className="relative min-h-[112px] bg-card">
                    {nonBookableWidth !== null ? (
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 bg-muted/65"
                        style={{ width: `${nonBookableWidth}%` }}
                      />
                    ) : null}

                    {hourTicks.map((minute) => (
                      <div
                        key={minute}
                        className="absolute top-0 h-full border-l border-border/50"
                        style={{
                          left: `${((minute - timelineStart) / timelineDuration) * 100}%`,
                        }}
                      />
                    ))}

                    {currentTimeLineLeft !== null ? (
                      <div
                        className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-primary"
                        style={{ left: `${currentTimeLineLeft}%` }}
                      />
                    ) : null}

                    {pastUnoccupiedSlots.map((slot) => (
                      <div
                        key={`${bikeItem.id}-past-free-${slot.start}-${slot.end}`}
                        className="absolute top-5 h-16 rounded-md border border-border bg-muted px-3 py-2 text-left text-xs text-muted-foreground"
                        style={{
                          left: `${((slot.start - timelineStart) / timelineDuration) * 100}%`,
                          width: `${((slot.end - slot.start) / timelineDuration) * 100}%`,
                        }}
                      >
                        <span className="block truncate font-semibold">
                          Unbesetzt
                        </span>
                        <span className="block truncate">
                          {formatMinutes(slot.start)} -{" "}
                          {formatMinutes(slot.end)}
                        </span>
                      </div>
                    ))}

                    {dayAvailability.active
                      ? freeSlots.map((slot) => (
                          <button
                            key={`${bikeItem.id}-free-${slot.start}-${slot.end}`}
                            type="button"
                            onClick={() =>
                              selectSlot(bikeItem.id, slot.start, slot.end)
                            }
                            className="absolute top-5 h-16 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-left text-xs text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100"
                            style={{
                              left: `${((slot.start - timelineStart) / timelineDuration) * 100}%`,
                              width: `${((slot.end - slot.start) / timelineDuration) * 100}%`,
                            }}
                          >
                            <span className="block truncate font-semibold">
                              Frei
                            </span>
                            <span className="block truncate">
                              {formatMinutes(slot.start)} -{" "}
                              {formatMinutes(slot.end)}
                            </span>
                          </button>
                        ))
                      : null}

                    {bikeReservations.map((reservation) => {
                      const rangeItem = reservationRangeInMinutes(
                        reservation,
                        timelineStart,
                        timelineEnd,
                      );
                      const canCancel = isAdmin || reservation.user_id === userId;
                      const completedReservation =
                        currentMinute !== null && rangeItem.end <= currentMinute;

                      if (rangeItem.end <= rangeItem.start) return null;

                      return (
                        <div
                          key={reservation.id}
                          className={cn(
                            "absolute top-5 flex h-16 min-w-[76px] items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs shadow-sm",
                            completedReservation
                              ? "border-border bg-muted text-muted-foreground"
                              : "border-[#c9c5f6] bg-[#f8f7ff]",
                          )}
                          style={{
                            left: `${((rangeItem.start - timelineStart) / timelineDuration) * 100}%`,
                            width: `${((rangeItem.end - rangeItem.start) / timelineDuration) * 100}%`,
                          }}
                        >
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "truncate font-semibold",
                                completedReservation
                                  ? "text-muted-foreground"
                                  : "text-foreground",
                              )}
                            >
                              {isAdmin
                                ? profileById.get(reservation.user_id) ??
                                  "Reserviert"
                                : "Reserviert"}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {formatMinutes(rangeItem.start)} -{" "}
                              {formatMinutes(rangeItem.end)}
                            </p>
                          </div>
                          {canCancel ? (
                            <button
                              type="button"
                              onClick={() => cancelReservation(reservation)}
                              className="rounded-sm p-0.5 text-muted-foreground hover:bg-white hover:text-foreground"
                              title="Stornieren"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {reservationModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ebike-reservation-dialog-title"
            className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
          >
            <form onSubmit={reserve}>
              <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 shrink-0">
                    <h2
                      id="ebike-reservation-dialog-title"
                      className="text-lg font-semibold"
                    >
                      Reservierung
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dayAvailability.active
                        ? `${WEEKDAY_LABELS[dayOfWeek]} · ${shortTime(dayAvailability.start_time)} - ${shortTime(dayAvailability.end_time)}`
                      : `${WEEKDAY_LABELS[dayOfWeek]} · Nicht verfügbar`}
                    </p>
                  </div>
                  <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:max-w-[620px]">
                    <div className="min-w-0">
                      <Label htmlFor="reservation-modal-bike" className="sr-only">
                        E-Bike
                      </Label>
                      <Select
                        id="reservation-modal-bike"
                        value={selectedBikeId}
                        onChange={(event) =>
                          setSelectedBikeId(event.target.value)
                        }
                        className="h-11 text-base"
                        required
                      >
                        <option value="">E-Bike auswählen</option>
                        {timelineBikes.map((bikeItem) => (
                          <option key={bikeItem.id} value={bikeItem.id}>
                            {bikeItem.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="relative min-w-0">
                      <Label id="reservation-modal-date-label" className="sr-only">
                        Datum
                      </Label>
                      <button
                        type="button"
                        aria-labelledby="reservation-modal-date-label"
                        onClick={() => {
                          setCalendarMonth(selectedDateObject);
                          setReservationCalendarOpen((open) => !open);
                        }}
                        className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 text-left text-base outline-none transition hover:bg-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate font-medium">
                            {selectedDateLabel}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>

                      {reservationCalendarOpen ? (
                        <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 shadow-xl">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => shiftCalendarMonth(-1)}
                              title="Vorheriger Monat"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <p className="text-sm font-semibold">
                              {MONTH_LABELS[calendarMonth.getMonth()]}{" "}
                              {calendarMonth.getFullYear()}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => shiftCalendarMonth(1)}
                              title="Nächster Monat"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                            {CALENDAR_WEEKDAY_LABELS.map((label) => (
                              <span key={label} className="py-1">
                                {label}
                              </span>
                            ))}
                          </div>
                          <div className="mt-1 grid grid-cols-7 gap-1">
                            {calendarDays.map((date) => {
                              const dateValue = toDateInputValue(date);
                              const disabled = dateValue < today;
                              const selected = dateValue === selectedDate;
                              const currentMonth =
                                date.getMonth() === calendarMonth.getMonth();

                              return (
                                <button
                                  key={dateValue}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => handleDateChange(dateValue)}
                                  className={cn(
                                    "flex h-9 items-center justify-center rounded-md text-sm font-medium transition",
                                    currentMonth
                                      ? "text-foreground"
                                      : "text-muted-foreground/55",
                                    selected
                                      ? "bg-primary text-primary-foreground hover:bg-primary"
                                      : "hover:bg-muted",
                                    dateValue === today && !selected
                                      ? "ring-1 ring-primary/30"
                                      : "",
                                    disabled
                                      ? "cursor-not-allowed text-muted-foreground/30 hover:bg-transparent"
                                      : "",
                                  )}
                                >
                                  {date.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeReservationModal}
                  disabled={loading}
                  title="Schließen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-5 p-5">
                {message ? <Notice tone="danger">{message}</Notice> : null}

                {!modalCanSelectTime ? (
                  <Notice>
                    Für diesen Tag ist aktuell kein buchbarer Zeitraum mehr
                    verfügbar.
                  </Notice>
                ) : null}

                {modalHasConflict ? (
                  <Notice tone="danger">
                    Dieses Zeitfenster überschneidet sich mit einer bestehenden
                    Reservierung.
                  </Notice>
                ) : null}

                <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <div className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                          Zeitraum
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {formatMinutes(modalStartMinute)} -{" "}
                          {formatMinutes(modalEndMinute)}
                        </p>
                      </div>
                      <Badge tone={modalHasConflict ? "danger" : "success"}>
                        {formatDuration(modalDurationMinutes)}
                      </Badge>
                    </div>

                    <div
                      ref={modalTimeTrackRef}
                      onPointerDown={(event) =>
                        handleTimeRangePointerDown(event, "track")
                      }
                      className={cn(
                        "relative mt-4 h-24 touch-none overflow-hidden rounded-lg border border-border bg-muted",
                        modalCanSelectTime
                          ? "cursor-copy"
                          : "cursor-not-allowed opacity-60",
                      )}
                    >
                      {dayAvailability.active ? (
                        <>
                          {modalDisabledWidth > 0 ? (
                            <div
                              className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-muted-foreground/10"
                              style={{ width: `${modalDisabledWidth}%` }}
                            />
                          ) : null}

                          {modalBusyRanges.map((item) => (
                            <div
                              key={`modal-busy-${item.start}-${item.end}`}
                              className="pointer-events-none absolute inset-y-3 z-10 rounded-md border border-[#c9c5f6] bg-[#f8f7ff]"
                              style={{
                                left: `${((item.start - availabilityStart) / modalTimelineDuration) * 100}%`,
                                width: `${((item.end - item.start) / modalTimelineDuration) * 100}%`,
                              }}
                              title={`Belegt ${formatMinutes(item.start)} - ${formatMinutes(item.end)}`}
                            />
                          ))}

                          {modalHourTicks.map((minute) => (
                            <div
                              key={`modal-hour-${minute}`}
                              className="pointer-events-none absolute inset-y-0 border-l border-border/70"
                              style={{
                                left: `${((minute - availabilityStart) / modalTimelineDuration) * 100}%`,
                              }}
                            />
                          ))}

                          {currentTimeLineLeft !== null ? (
                            <div
                              className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-primary"
                              style={{ left: `${currentTimeLineLeft}%` }}
                            />
                          ) : null}

                          <div
                            onPointerDown={(event) =>
                              handleTimeRangePointerDown(event, "range")
                            }
                            className={cn(
                              "absolute inset-y-2 z-30 rounded-lg border border-primary bg-primary shadow-md transition",
                              modalCanSelectTime
                                ? "cursor-grab active:cursor-grabbing"
                                : "pointer-events-none",
                            )}
                            style={{
                              left: `${modalSelectionLeft}%`,
                              width: `${modalSelectionWidth}%`,
                            }}
                          >
                            <button
                              type="button"
                              onPointerDown={(event) =>
                                handleTimeRangePointerDown(event, "start")
                              }
                              className="absolute left-0 top-1/2 h-10 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-white shadow-sm"
                              aria-label="Start verschieben"
                              disabled={!modalCanSelectTime}
                            />
                            <button
                              type="button"
                              onPointerDown={(event) =>
                                handleTimeRangePointerDown(event, "end")
                              }
                              className="absolute right-0 top-1/2 h-10 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border border-primary bg-white shadow-sm"
                              aria-label="Ende verschieben"
                              disabled={!modalCanSelectTime}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {dayAvailability.active
                          ? shortTime(dayAvailability.start_time)
                          : ""}
                      </span>
                      <span>
                        {dayAvailability.active
                          ? shortTime(dayAvailability.end_time)
                          : ""}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => moveReservationRange(-15)}
                        disabled={!modalCanSelectTime}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        15 Min.
                      </Button>
                      {EBIKE_RESERVATION_DURATION_PRESETS.map((minutes) => (
                        <Button
                          key={minutes}
                          type="button"
                          variant={
                            modalDurationMinutes === minutes
                              ? "primary"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => setReservationDuration(minutes)}
                          disabled={!modalCanSelectTime}
                        >
                          {formatDuration(minutes)}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => moveReservationRange(15)}
                        disabled={!modalCanSelectTime}
                      >
                        15 Min.
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <Field>
                    <Label>Start</Label>
                    <div className="mt-1 flex h-12 items-center justify-between gap-2 rounded-md border border-border bg-card px-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setReservationMinutes(
                            modalStartMinute - 15,
                            modalEndMinute,
                          )
                        }
                        disabled={!modalCanSelectTime}
                        title="Start früher"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xl font-semibold tabular-nums">
                        {formatMinutes(modalStartMinute)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setReservationMinutes(
                            modalStartMinute + 15,
                            modalEndMinute,
                          )
                        }
                        disabled={!modalCanSelectTime}
                        title="Start später"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </Field>
                  <Field>
                    <Label>Ende</Label>
                    <div className="mt-1 flex h-12 items-center justify-between gap-2 rounded-md border border-border bg-card px-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setReservationMinutes(
                            modalStartMinute,
                            modalEndMinute - 15,
                          )
                        }
                        disabled={!modalCanSelectTime}
                        title="Ende früher"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xl font-semibold tabular-nums">
                        {formatMinutes(modalEndMinute)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setReservationMinutes(
                            modalStartMinute,
                            modalEndMinute + 15,
                          )
                        }
                        disabled={!modalCanSelectTime}
                        title="Ende später"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </Field>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border p-5 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeReservationModal}
                  disabled={loading}
                >
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !modalCanSelectTime || modalHasConflict}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Reservieren
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingReservation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ebike-safety-confirmation-title"
            className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2
                    id="ebike-safety-confirmation-title"
                    className="font-semibold"
                  >
                    Sicherheitsbestätigung
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    E-Bike Reservierung
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setPendingReservation(null);
                  setSafetyAcknowledged(false);
                }}
                disabled={loading}
                title="Schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4 p-5">
              <div className="max-h-[42vh] overflow-y-auto rounded-md border border-border bg-muted/45 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {pendingSafetyConfirmationText}
                </p>
              </div>

              <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={safetyAcknowledged}
                  onChange={(event) =>
                    setSafetyAcknowledged(event.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                />
                Gelesen und bestätigt
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPendingReservation(null);
                    setSafetyAcknowledged(false);
                  }}
                  disabled={loading}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  onClick={confirmSafetyAndReserve}
                  disabled={loading || !safetyAcknowledged}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Bestätigen und reservieren
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EBikeFleetPage({
  initialBikes,
  isAdmin,
}: {
  initialBikes: EBike[];
  isAdmin: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [bikes, setBikes] = useState(initialBikes);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBikeForm, setShowBikeForm] = useState(false);
  const [bikeForm, setBikeForm] = useState<BikeForm>(emptyBikeForm());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);

  const availableBikes = useMemo(() => {
    return bikes.filter((bike) => bike.active && bike.status === "available");
  }, [bikes]);

  const otherBikes = useMemo(() => {
    return bikes.filter((bike) => !(bike.active && bike.status === "available"));
  }, [bikes]);
  const displayedImageUrl = imagePreviewUrl ?? bikeForm.image_url;

  const reload = useCallback(async () => {
    const { data } = await supabase.from("ebikes").select("*").order("name");
    setBikes((data ?? []) as EBike[]);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("ullis-ebike-fleet")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ebikes" },
        () => reload(),
      )
      .subscribe();

    return () => {
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

  function startCreateBike() {
    setBikeForm(emptyBikeForm());
    setSelectedImageFile(null);
    setShowBikeForm(true);
    setMessage(null);
  }

  function startEditBike(bike: EBike) {
    setBikeForm(fromBike(bike));
    setSelectedImageFile(null);
    setShowBikeForm(true);
    setMessage(null);
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

    if (!EBIKE_IMAGE_ACCEPTED_TYPES.includes(file.type)) {
      setSelectedImageFile(null);
      setMessage("Bitte ein Bild im Format JPG, PNG, WebP oder GIF auswählen.");
      return false;
    }

    if (file.size > EBIKE_IMAGE_MAX_BYTES) {
      setSelectedImageFile(null);
      setMessage("Das Bild darf maximal 5 MB groß sein.");
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

  async function uploadBikeImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/ebike-images", {
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

  async function saveBike(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!bikeForm.name.trim()) {
      setMessage("Name ist erforderlich.");
      return;
    }

    setLoading(true);

    try {
      const imageUrl = imageFile
        ? await uploadBikeImage(imageFile)
        : bikeForm.image_url.trim() || null;
      const payload = {
        name: bikeForm.name.trim(),
        model: bikeForm.model.trim() || null,
        frame_size: bikeForm.frame_size.trim() || null,
        status: bikeForm.status,
        image_url: imageUrl,
        notes: bikeForm.notes.trim() || null,
      };

      const { error } = bikeForm.id
        ? await supabase.from("ebikes").update(payload).eq("id", bikeForm.id)
        : await supabase.from("ebikes").insert(payload);

      if (error) {
        setMessage(error.message);
        return;
      }

      setShowBikeForm(false);
      setSelectedImageFile(null);
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

  async function toggleBikeActive(bike: EBike) {
    const { error } = await supabase
      .from("ebikes")
      .update({ active: !bike.active })
      .eq("id", bike.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  async function duplicateBike(bike: EBike) {
    setMessage(null);
    setLoading(true);

    const { error } = await supabase.from("ebikes").insert({
      name: `${bike.name} Kopie`,
      model: bike.model,
      frame_size: bike.frame_size,
      status: editableStatuses.includes(bike.status) ? bike.status : "available",
      image_url: bike.image_url,
      notes: bike.notes,
      active: bike.active,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  async function deleteBike(bike: EBike) {
    if (!window.confirm(`E-Bike "${bike.name}" löschen?`)) return;

    const { error } = await supabase.from("ebikes").delete().eq("id", bike.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="E-Bike Fuhrpark"
        eyebrow="Verfügbare Fahrräder"
        action={<EBikesSectionNav />}
      />

      {isAdmin ? (
        <div className="flex justify-end">
          <Button onClick={startCreateBike}>
            <Plus className="h-4 w-4" />
            Neues E-Bike
          </Button>
        </div>
      ) : null}

      {message ? <Notice tone="danger">{message}</Notice> : null}

      {isAdmin && showBikeForm ? (
        <Card className="min-w-0 overflow-hidden p-5">
          <form onSubmit={saveBike} className="space-y-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <h2 className="font-semibold">
                {bikeForm.id ? "E-Bike bearbeiten" : "Neues E-Bike"}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowBikeForm(false)}
                title="Schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <Field className="min-w-0">
                <Label htmlFor="bike-name">Name</Label>
                <Input
                  id="bike-name"
                  value={bikeForm.name}
                  onChange={(event) =>
                    setBikeForm({ ...bikeForm, name: event.target.value })
                  }
                  required
                />
              </Field>
              <Field className="min-w-0">
                <Label htmlFor="bike-model">Modell</Label>
                <Input
                  id="bike-model"
                  value={bikeForm.model}
                  onChange={(event) =>
                    setBikeForm({ ...bikeForm, model: event.target.value })
                  }
                />
              </Field>
              <Field className="min-w-0">
                <Label htmlFor="bike-frame">Rahmengröße</Label>
                <Input
                  id="bike-frame"
                  value={bikeForm.frame_size}
                  onChange={(event) =>
                    setBikeForm({
                      ...bikeForm,
                      frame_size: event.target.value,
                    })
                  }
                />
              </Field>
              <Field className="min-w-0">
                <Label htmlFor="bike-status">Status</Label>
                <Select
                  id="bike-status"
                  value={bikeForm.status}
                  onChange={(event) =>
                    setBikeForm({
                      ...bikeForm,
                      status: event.target.value as EBikeStatus,
                    })
                  }
                >
                  {editableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field className="min-w-0 md:col-span-2">
                <Label htmlFor="bike-image">Bild</Label>
                <Input
                  id="bike-image"
                  type="file"
                  accept={EBIKE_IMAGE_ACCEPTED_TYPES.join(",")}
                  onChange={handleImageChange}
                  className="sr-only"
                />
                <label
                  htmlFor="bike-image"
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
                          alt="E-Bike Bild"
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
                          : "JPG, PNG, WebP oder GIF bis 5 MB"}
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
              <Field className="min-w-0 md:col-span-2">
                <Label htmlFor="bike-notes">Notizen</Label>
                <Textarea
                  id="bike-notes"
                  rows={3}
                  value={bikeForm.notes}
                  onChange={(event) =>
                    setBikeForm({ ...bikeForm, notes: event.target.value })
                  }
                />
              </Field>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {availableBikes.map((bikeItem) => (
          <FleetBikeCard
            key={bikeItem.id}
            bike={bikeItem}
            isAdmin={isAdmin}
            onEdit={startEditBike}
            onDuplicate={duplicateBike}
            onToggleActive={toggleBikeActive}
            onDelete={deleteBike}
          />
        ))}
        {availableBikes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aktuell sind keine E-Bikes verfügbar.
          </p>
        ) : null}
      </section>

      {isAdmin && otherBikes.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Weitere Fahrräder</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {otherBikes.map((bikeItem) => (
              <FleetBikeCard
                key={bikeItem.id}
                bike={bikeItem}
                isAdmin={isAdmin}
                onEdit={startEditBike}
                onDuplicate={duplicateBike}
                onToggleActive={toggleBikeActive}
                onDelete={deleteBike}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FleetBikeCard({
  bike,
  isAdmin,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
}: {
  bike: EBike;
  isAdmin: boolean;
  onEdit: (bike: EBike) => void;
  onDuplicate: (bike: EBike) => void;
  onToggleActive: (bike: EBike) => void;
  onDelete: (bike: EBike) => void;
}) {
  return (
    <Card className="overflow-hidden">
      {bike.image_url ? (
        <div className="aspect-[16/9] bg-muted">
          <img
            src={bike.image_url}
            alt={bike.name}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-muted">
          <Bike className="h-10 w-10 text-primary/70" />
        </div>
      )}
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{bike.name}</h2>
            <p className="text-sm text-muted-foreground">
              {bikeDetails(bike) || "Ohne Details"}
            </p>
          </div>
          <Badge tone={bike.active ? statusTone[bike.status] : "neutral"}>
            {bike.active ? statusLabel[bike.status] : "Inaktiv"}
          </Badge>
        </div>

        {bike.notes ? (
          <p className="text-sm text-muted-foreground">{bike.notes}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {isReservableBike(bike) ? (
            <Link
              href={`/e-bikes/reservierungen?bike=${bike.id}`}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Reservieren
            </Link>
          ) : null}
          {isAdmin ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEdit(bike)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Bearbeiten
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDuplicate(bike)}
              >
                <Copy className="h-3.5 w-3.5" />
                Duplizieren
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onToggleActive(bike)}
              >
                <Power className="h-3.5 w-3.5" />
                {bike.active ? "Deaktivieren" : "Aktivieren"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDelete(bike)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                Löschen
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
