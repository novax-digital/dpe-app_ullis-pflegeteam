"use client";

import { FormEvent, useState } from "react";
import { BriefcaseBusiness, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { SettingsSectionNav } from "@/components/settings-page";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
} from "@/components/ui";
import type { Database } from "@/lib/database.types";

type AppPosition = Database["public"]["Tables"]["app_positions"]["Row"];

export function PositionsSettingsPage({
  initialPositions,
}: {
  initialPositions: AppPosition[];
}) {
  const [positions, setPositions] = useState(initialPositions);
  const [label, setLabel] = useState("");
  const [editTarget, setEditTarget] = useState<AppPosition | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AppPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function clearFeedback() {
    setMessage(null);
    setSuccess(null);
  }

  async function createPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || loading) return;

    setLoading(true);
    clearFeedback();
    const response = await fetch("/api/admin/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      position?: AppPosition;
      error?: string;
    };
    setLoading(false);

    if (!response.ok || !data.position) {
      setMessage(data.error ?? "Berufsbezeichnung konnte nicht angelegt werden.");
      return;
    }

    setPositions((current) => [...current, data.position!]);
    setLabel("");
    setSuccess(`„${data.position.label}“ wurde angelegt.`);
  }

  function startEditing(position: AppPosition) {
    clearFeedback();
    setEditTarget(position);
    setEditLabel(position.label);
  }

  async function updatePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || !editLabel.trim() || loading) return;

    setLoading(true);
    clearFeedback();
    const response = await fetch("/api/admin/positions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, label: editLabel }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      position?: AppPosition;
      error?: string;
    };
    setLoading(false);

    if (!response.ok || !data.position) {
      setMessage(data.error ?? "Änderung konnte nicht gespeichert werden.");
      return;
    }

    setPositions((current) =>
      current.map((item) =>
        item.id === data.position!.id ? data.position! : item,
      ),
    );
    setEditTarget(null);
    setEditLabel("");
    setSuccess(`„${data.position.label}“ wurde gespeichert.`);
  }

  async function deletePosition() {
    if (!deleteTarget || loading) return;

    setLoading(true);
    clearFeedback();
    const response = await fetch("/api/admin/positions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setLoading(false);

    if (!response.ok) {
      setMessage(data.error ?? "Berufsbezeichnung konnte nicht gelöscht werden.");
      return;
    }

    setPositions((current) =>
      current.filter((item) => item.id !== deleteTarget.id),
    );
    setSuccess(`„${deleteTarget.label}“ wurde gelöscht.`);
    setDeleteTarget(null);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Einstellungen"
        eyebrow="Admin · Berufsbezeichnungen"
        action={<SettingsSectionNav isAdmin />}
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <Card className="p-5">
        <form onSubmit={createPosition} className="space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Berufsbezeichnung anlegen</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Die Einträge stehen anschließend bei der Verwaltung von
            Mitarbeiterkonten zur Auswahl.
          </p>
          <Field>
            <Label htmlFor="position-label">Bezeichnung</Label>
            <Input
              id="position-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="z. B. Hauswirtschaftskraft"
              maxLength={80}
              required
            />
          </Field>
          <Button type="submit" disabled={loading || !label.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Anlegen
          </Button>
        </form>
      </Card>

      {editTarget ? (
        <Card className="p-5">
          <form onSubmit={updatePosition} className="space-y-4">
            <h2 className="font-semibold">Berufsbezeichnung bearbeiten</h2>
            <Field>
              <Label htmlFor="edit-position-label">Bezeichnung</Label>
              <Input
                id="edit-position-label"
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
                maxLength={80}
                required
              />
              <p className="text-xs text-muted-foreground">
                Die Änderung wird auch für bereits zugewiesene Konten übernommen.
              </p>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading || !editLabel.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Speichern
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => setEditTarget(null)}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Verfügbare Berufsbezeichnungen</h2>
          </div>
        </div>
        <div className="divide-y divide-border">
          {positions.map((position) => (
            <div
              key={position.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <p className="font-medium">{position.label}</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Berufsbezeichnung bearbeiten"
                  aria-label="Berufsbezeichnung bearbeiten"
                  disabled={loading}
                  onClick={() => startEditing(position)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Berufsbezeichnung löschen"
                  aria-label="Berufsbezeichnung löschen"
                  disabled={loading}
                  onClick={() => setDeleteTarget(position)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {positions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Noch keine Berufsbezeichnungen angelegt.
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Berufsbezeichnung löschen?"
        description="Bei Konten mit dieser Berufsbezeichnung wird die Angabe entfernt. Diese Aktion kann nicht rückgängig gemacht werden."
        detail={deleteTarget?.label}
        confirmLabel={loading ? "Wird gelöscht …" : "Löschen"}
        onCancel={() => {
          if (!loading) setDeleteTarget(null);
        }}
        onConfirm={deletePosition}
      />
    </div>
  );
}
