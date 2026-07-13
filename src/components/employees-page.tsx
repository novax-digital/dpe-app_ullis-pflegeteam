"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
} from "@/components/ui";
import { ROLE_LABEL, type AppRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type UserRole = Database["public"]["Tables"]["user_roles"]["Row"];

const positions = [
  "Pflegedienstleitung",
  "Stellv. Pflegedienstleitung",
  "Pflegefachkraft",
  "Pflegehelfer:in",
  "Verwaltung",
  "Auszubildende:r",
  "Sonstige",
];

const roleOptions: AppRole[] = ["employee", "admin", "physiotherapy"];

export function EmployeesPage({
  initialProfiles,
  initialRoles,
  currentUserId,
}: {
  initialProfiles: Profile[];
  initialRoles: UserRole[];
  currentUserId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [roles, setRoles] = useState(initialRoles);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState(positions[2]);
  const [role, setRole] = useState<AppRole>("employee");
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const rolesByUser = useMemo(() => {
    const map = new Map<string, AppRole[]>();
    roles.forEach((row) => {
      const current = map.get(row.user_id) ?? [];
      current.push(row.role);
      map.set(row.user_id, current);
    });
    return map;
  }, [roles]);

  async function reload() {
    const [profilesResult, rolesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
    ]);

    setProfiles((profilesResult.data ?? []) as Profile[]);
    setRoles((rolesResult.data ?? []) as UserRole[]);
  }

  function resetForm() {
    setFullName("");
    setEmail("");
    setPosition(positions[2]);
    setRole("employee");
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    if (!fullName.trim() || !email.trim()) {
      setMessage("Name und E-Mail sind erforderlich.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email,
        position,
        role,
      }),
    });
    const body = await response.json().catch(() => ({}));

    setLoading(false);

    if (!response.ok) {
      setMessage(body.error ?? "Anlegen fehlgeschlagen.");
      return;
    }

    setSuccess("Mitarbeiter:in wurde angelegt und per E-Mail eingeladen.");
    resetForm();
    setShowForm(false);
    await reload();
  }

  async function deleteEmployee() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    setMessage(null);
    setSuccess(null);

    const response = await fetch("/api/admin/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: deleteTarget.id }),
    });
    const body = await response.json().catch(() => ({}));

    setDeleting(false);

    if (!response.ok) {
      setMessage(body.error ?? "Löschen fehlgeschlagen.");
      return;
    }

    setDeleteTarget(null);
    setSuccess("Benutzerkonto wurde dauerhaft gelöscht.");
    await reload();
  }

  function startEditing(profile: Profile) {
    setMessage(null);
    setSuccess(null);
    setEditTarget(profile);
    setEditFullName(profile.full_name ?? "");
    setEditEmail(profile.email ?? "");
    setEditPosition(profile.position ?? "");
  }

  function stopEditing() {
    setEditTarget(null);
    setEditFullName("");
    setEditEmail("");
    setEditPosition("");
  }

  async function updateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || savingEdit) return;

    if (!editFullName.trim() || !editEmail.trim()) {
      setMessage("Name und E-Mail sind erforderlich.");
      return;
    }

    setSavingEdit(true);
    setMessage(null);
    setSuccess(null);

    const response = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: editTarget.id,
        full_name: editFullName,
        email: editEmail,
        position: editPosition,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSavingEdit(false);

    if (!response.ok) {
      setMessage(body.error ?? "Änderungen konnten nicht gespeichert werden.");
      return;
    }

    stopEditing();
    setSuccess("Mitarbeiterkonto wurde aktualisiert.");
    await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mitarbeitende"
        eyebrow="Konten und Rollen"
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Neues Konto
          </Button>
        }
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      {showForm ? (
        <Card className="p-5">
          <form onSubmit={createEmployee} className="space-y-4">
            <h2 className="font-semibold">Neues Konto</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <Label htmlFor="employee-name">Name</Label>
                <Input
                  id="employee-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="employee-email">E-Mail</Label>
                <Input
                  id="employee-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="employee-position">Berufsbezeichnung</Label>
                <Select
                  id="employee-position"
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                >
                  {positions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="employee-role">Rolle</Label>
                <Select
                  id="employee-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as AppRole)}
                >
                  {roleOptions.map((item) => (
                    <option key={item} value={item}>
                      {ROLE_LABEL[item]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Anlegen
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {editTarget ? (
        <Card className="p-5">
          <form onSubmit={updateEmployee} className="space-y-4">
            <h2 className="font-semibold">Mitarbeiterkonto bearbeiten</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <Label htmlFor="edit-employee-name">Name</Label>
                <Input
                  id="edit-employee-name"
                  value={editFullName}
                  onChange={(event) => setEditFullName(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="edit-employee-email">E-Mail</Label>
                <Input
                  id="edit-employee-email"
                  type="email"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Die neue Adresse wird auch für die Anmeldung verwendet.
                </p>
              </Field>
              <Field>
                <Label htmlFor="edit-employee-position">Berufsbezeichnung</Label>
                <Select
                  id="edit-employee-position"
                  value={editPosition}
                  onChange={(event) => setEditPosition(event.target.value)}
                >
                  <option value="">Keine Angabe</option>
                  {editPosition && !positions.includes(editPosition) ? (
                    <option value={editPosition}>{editPosition}</option>
                  ) : null}
                  {positions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Änderungen speichern
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={savingEdit}
                onClick={stopEditing}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="border-b border-border bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">E-Mail</th>
                <th className="px-4 py-3 font-medium">Berufsbezeichnung</th>
                <th className="px-4 py-3 font-medium">Rollen</th>
                <th className="px-4 py-3 font-medium">Seit</th>
                <th className="px-4 py-3 text-right font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {profile.full_name || "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {profile.email || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {profile.position || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(rolesByUser.get(profile.id) ?? []).map((item) => (
                        <Badge key={item}>{ROLE_LABEL[item]}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(profile.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Mitarbeiterkonto bearbeiten"
                        aria-label="Mitarbeiterkonto bearbeiten"
                        disabled={savingEdit || deleting}
                        onClick={() => startEditing(profile)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={
                          profile.id === currentUserId
                            ? "Das eigene Konto kann nicht gelöscht werden"
                            : "Benutzerkonto löschen"
                        }
                        aria-label="Benutzerkonto löschen"
                        disabled={profile.id === currentUserId || deleting}
                        onClick={() => setDeleteTarget(profile)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {profiles.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Keine Mitarbeitenden gefunden.
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Benutzerkonto löschen?"
        description="Das Konto und die damit verknüpften Daten werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        detail={deleteTarget?.full_name || deleteTarget?.email || undefined}
        confirmLabel={deleting ? "Wird gelöscht …" : "Konto löschen"}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={deleteEmployee}
      />
    </div>
  );
}
