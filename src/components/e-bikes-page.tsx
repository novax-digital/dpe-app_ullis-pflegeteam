"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bike, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";
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
import { formatDateTime, toDatetimeLocal } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type EBike = Database["public"]["Tables"]["ebikes"]["Row"];
type Reservation = Database["public"]["Tables"]["ebike_reservations"]["Row"];
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email"
>;
type EBikeStatus = Database["public"]["Enums"]["ebike_status"];

const statusLabel: Record<EBikeStatus, string> = {
  available: "Verfuegbar",
  reserved: "Reserviert",
  in_use: "Unterwegs",
  maintenance: "Wartung",
  unavailable: "Nicht verfuegbar",
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

type BikeForm = {
  id?: string;
  name: string;
  model: string;
  frame_size: string;
  location: string;
  status: EBikeStatus;
  image_url: string;
  notes: string;
};

function emptyBikeForm(): BikeForm {
  return {
    name: "",
    model: "",
    frame_size: "",
    location: "",
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
    location: bike.location ?? "",
    status: editableStatuses.includes(bike.status) ? bike.status : "available",
    image_url: bike.image_url ?? "",
    notes: bike.notes ?? "",
  };
}

function defaultReservationRange() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  return {
    start: toDatetimeLocal(start),
    end: toDatetimeLocal(end),
  };
}

export function EBikesPage({
  initialBikes,
  initialReservations,
  initialProfiles,
  isAdmin,
  userId,
}: {
  initialBikes: EBike[];
  initialReservations: Reservation[];
  initialProfiles: Profile[];
  isAdmin: boolean;
  userId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [bikes, setBikes] = useState(initialBikes);
  const [reservations, setReservations] = useState(initialReservations);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBikeForm, setShowBikeForm] = useState(false);
  const [bikeForm, setBikeForm] = useState<BikeForm>(emptyBikeForm());
  const [selectedBikeId, setSelectedBikeId] = useState<string>("");
  const [purpose, setPurpose] = useState("");
  const [range, setRange] = useState(defaultReservationRange());
  const [nowMs, setNowMs] = useState(0);

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

  const upcomingReservations = useMemo(() => {
    return reservations
      .filter(
        (reservation) =>
          reservation.status === "active" &&
          new Date(reservation.end_time).getTime() >= nowMs,
      )
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
  }, [nowMs, reservations]);

  const selectedBike = bikes.find((bike) => bike.id === selectedBikeId);

  const reload = useCallback(async () => {
    const [bikeResult, reservationResult, profileResult] = await Promise.all([
      supabase.from("ebikes").select("*").order("name"),
      supabase
        .from("ebike_reservations")
        .select("*")
        .order("start_time", { ascending: true }),
      isAdmin
        ? supabase.from("profiles").select("id, full_name, email")
        : Promise.resolve({ data: [] }),
    ]);

    setBikes((bikeResult.data ?? []) as EBike[]);
    setReservations((reservationResult.data ?? []) as Reservation[]);
    setProfiles((profileResult.data ?? []) as Profile[]);
  }, [isAdmin, supabase]);

  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now());
    const timeout = window.setTimeout(refreshNow, 0);
    const interval = window.setInterval(refreshNow, 60_000);

    const channel = supabase
      .channel("ullis-ebikes")
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
      .subscribe();

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  function startCreateBike() {
    setBikeForm(emptyBikeForm());
    setShowBikeForm(true);
    setMessage(null);
  }

  function startEditBike(bike: EBike) {
    setBikeForm(fromBike(bike));
    setShowBikeForm(true);
    setMessage(null);
  }

  async function saveBike(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!bikeForm.name.trim()) {
      setMessage("Name ist erforderlich.");
      return;
    }

    setLoading(true);

    const payload = {
      name: bikeForm.name.trim(),
      model: bikeForm.model.trim() || null,
      frame_size: bikeForm.frame_size.trim() || null,
      location: bikeForm.location.trim() || null,
      status: bikeForm.status,
      image_url: bikeForm.image_url.trim() || null,
      notes: bikeForm.notes.trim() || null,
    };

    const { error } = bikeForm.id
      ? await supabase.from("ebikes").update(payload).eq("id", bikeForm.id)
      : await supabase.from("ebikes").insert(payload);

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setShowBikeForm(false);
    await reload();
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

  async function deleteBike(bike: EBike) {
    if (!window.confirm(`E-Bike "${bike.name}" loeschen?`)) return;

    const { error } = await supabase.from("ebikes").delete().eq("id", bike.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!selectedBike) {
      setMessage("Bitte ein E-Bike auswaehlen.");
      return;
    }

    const startDate = new Date(range.start);
    const endDate = new Date(range.end);

    if (endDate <= startDate) {
      setMessage("Endzeit muss nach Startzeit liegen.");
      return;
    }

    if (startDate.getTime() < Date.now() - 60_000) {
      setMessage("Startzeit darf nicht in der Vergangenheit liegen.");
      return;
    }

    if (endDate.getTime() - startDate.getTime() > 14 * 24 * 60 * 60 * 1000) {
      setMessage("Maximale Reservierungsdauer betraegt 14 Tage.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("ebike_reservations").insert({
      ebike_id: selectedBike.id,
      user_id: userId,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      purpose: purpose.trim() || null,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSelectedBikeId("");
    setPurpose("");
    setRange(defaultReservationRange());
    await reload();
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
    <div className="space-y-6">
      <PageHeader
        title="E-Bikes"
        eyebrow="Reservierungen"
        action={
          isAdmin ? (
            <Button onClick={startCreateBike}>
              <Plus className="h-4 w-4" />
              Neues E-Bike
            </Button>
          ) : undefined
        }
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}

      {isAdmin && showBikeForm ? (
        <Card className="p-5">
          <form onSubmit={saveBike} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">
                {bikeForm.id ? "E-Bike bearbeiten" : "Neues E-Bike"}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowBikeForm(false)}
                title="Schliessen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
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
              <Field>
                <Label htmlFor="bike-model">Modell</Label>
                <Input
                  id="bike-model"
                  value={bikeForm.model}
                  onChange={(event) =>
                    setBikeForm({ ...bikeForm, model: event.target.value })
                  }
                />
              </Field>
              <Field>
                <Label htmlFor="bike-frame">Rahmengroesse</Label>
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
              <Field>
                <Label htmlFor="bike-location">Standort</Label>
                <Input
                  id="bike-location"
                  value={bikeForm.location}
                  onChange={(event) =>
                    setBikeForm({ ...bikeForm, location: event.target.value })
                  }
                />
              </Field>
              <Field>
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
              <Field>
                <Label htmlFor="bike-image">Bild-URL</Label>
                <Input
                  id="bike-image"
                  value={bikeForm.image_url}
                  onChange={(event) =>
                    setBikeForm({ ...bikeForm, image_url: event.target.value })
                  }
                />
              </Field>
              <Field className="md:col-span-2">
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

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-4 md:grid-cols-2">
          {bikes.map((bikeItem) => {
            const canReserve =
              bikeItem.active &&
              !["maintenance", "unavailable", "in_use"].includes(
                bikeItem.status,
              );

            return (
              <Card key={bikeItem.id} className="overflow-hidden">
                {bikeItem.image_url ? (
                  <div className="aspect-[16/9] bg-muted">
                    <img
                      src={bikeItem.image_url}
                      alt={bikeItem.name}
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
                      <h2 className="truncate text-lg font-semibold">
                        {bikeItem.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {[bikeItem.model, bikeItem.frame_size, bikeItem.location]
                          .filter(Boolean)
                          .join(" · ") || "Ohne Details"}
                      </p>
                    </div>
                    <Badge tone={bikeItem.active ? statusTone[bikeItem.status] : "neutral"}>
                      {bikeItem.active ? statusLabel[bikeItem.status] : "Inaktiv"}
                    </Badge>
                  </div>

                  {bikeItem.notes ? (
                    <p className="text-sm text-muted-foreground">
                      {bikeItem.notes}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={selectedBikeId === bikeItem.id ? "primary" : "outline"}
                      size="sm"
                      disabled={!canReserve}
                      onClick={() => setSelectedBikeId(bikeItem.id)}
                    >
                      Reservieren
                    </Button>
                    {isAdmin ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEditBike(bikeItem)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Bearbeiten
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleBikeActive(bikeItem)}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {bikeItem.active ? "Deaktivieren" : "Aktivieren"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteBike(bikeItem)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          Loeschen
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <form onSubmit={reserve} className="space-y-4">
              <h2 className="font-semibold">Reservierung</h2>
              <Field>
                <Label htmlFor="reservation-bike">E-Bike</Label>
                <Select
                  id="reservation-bike"
                  value={selectedBikeId}
                  onChange={(event) => setSelectedBikeId(event.target.value)}
                  required
                >
                  <option value="">Auswaehlen</option>
                  {bikes
                    .filter(
                      (bikeItem) =>
                        bikeItem.active &&
                        !["maintenance", "unavailable", "in_use"].includes(
                          bikeItem.status,
                        ),
                    )
                    .map((bikeItem) => (
                      <option key={bikeItem.id} value={bikeItem.id}>
                        {bikeItem.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field>
                  <Label htmlFor="reservation-start">Start</Label>
                  <Input
                    id="reservation-start"
                    type="datetime-local"
                    value={range.start}
                    min={toDatetimeLocal(new Date())}
                    onChange={(event) =>
                      setRange({ ...range, start: event.target.value })
                    }
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="reservation-end">Ende</Label>
                  <Input
                    id="reservation-end"
                    type="datetime-local"
                    value={range.end}
                    min={range.start}
                    onChange={(event) =>
                      setRange({ ...range, end: event.target.value })
                    }
                    required
                  />
                </Field>
              </div>
              <Field>
                <Label htmlFor="reservation-purpose">Zweck</Label>
                <Textarea
                  id="reservation-purpose"
                  rows={3}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </Field>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Reservieren
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold">
              {isAdmin ? "Reservierungen" : "Meine Reservierungen"}
            </h2>
            <div className="space-y-3">
              {upcomingReservations.map((reservation) => {
                const bikeItem = bikes.find(
                  (item) => item.id === reservation.ebike_id,
                );
                const canCancel = isAdmin || reservation.user_id === userId;

                return (
                  <div
                    key={reservation.id}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {bikeItem?.name ?? "E-Bike"}
                        </p>
                        <p className="text-muted-foreground">
                          {formatDateTime(reservation.start_time)} bis{" "}
                          {formatDateTime(reservation.end_time)}
                        </p>
                        {isAdmin ? (
                          <p className="text-xs text-muted-foreground">
                            {profileById.get(reservation.user_id) ??
                              reservation.user_id}
                          </p>
                        ) : null}
                        {reservation.purpose ? (
                          <p className="mt-1 text-muted-foreground">
                            {reservation.purpose}
                          </p>
                        ) : null}
                      </div>
                      {canCancel ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => cancelReservation(reservation)}
                          title="Stornieren"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {upcomingReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine kommenden Reservierungen.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
