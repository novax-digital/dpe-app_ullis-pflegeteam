"use client";

import { FormEvent, useState } from "react";
import { Loader2, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { SettingsSectionNav } from "@/components/settings-page";
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
import type { AppRoleDefinition, SystemRole } from "@/lib/auth";

const baseRoleLabels: Record<SystemRole, string> = {
  admin: "Administration",
  employee: "Mitarbeitende",
  physiotherapy: "Physiotherapie",
};

export function RolesSettingsPage({
  initialRoles,
}: {
  initialRoles: AppRoleDefinition[];
}) {
  const [roles, setRoles] = useState(initialRoles);
  const [label, setLabel] = useState("");
  const [baseRole, setBaseRole] = useState<SystemRole>("employee");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppRoleDefinition | null>(
    null,
  );

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || loading) return;

    setLoading(true);
    setMessage(null);
    setSuccess(null);
    const response = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, base_role: baseRole }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      role?: AppRoleDefinition;
      error?: string;
    };
    setLoading(false);

    if (!response.ok || !data.role) {
      setMessage(data.error ?? "Rolle konnte nicht angelegt werden.");
      return;
    }

    setRoles((current) =>
      [...current, data.role!].sort((a, b) => a.label.localeCompare(b.label)),
    );
    setLabel("");
    setBaseRole("employee");
    setSuccess(`Die Rolle „${data.role.label}“ wurde angelegt.`);
  }

  async function deleteRole() {
    if (!deleteTarget || loading) return;
    setLoading(true);
    setMessage(null);
    setSuccess(null);
    const response = await fetch("/api/admin/roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: deleteTarget.key }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setLoading(false);

    if (!response.ok) {
      setMessage(data.error ?? "Rolle konnte nicht gelöscht werden.");
      return;
    }

    setRoles((current) =>
      current.filter((role) => role.key !== deleteTarget.key),
    );
    setSuccess(`Die Rolle „${deleteTarget.label}“ wurde gelöscht.`);
    setDeleteTarget(null);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Einstellungen"
        eyebrow="Admin · Rollen"
        action={<SettingsSectionNav isAdmin />}
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <Card className="p-5">
        <form onSubmit={createRole} className="space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Neue Rolle anlegen</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Eigene Rollen können anschließend Konten, Nachrichten und
            Teamseiten zugewiesen werden.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="role-label">Name</Label>
              <Input
                id="role-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="z. B. Hauswirtschaft"
                maxLength={80}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="role-base">Basisberechtigung</Label>
              <Select
                id="role-base"
                value={baseRole}
                onChange={(event) =>
                  setBaseRole(event.target.value as SystemRole)
                }
              >
                <option value="employee">Mitarbeitende</option>
                <option value="physiotherapy">Physiotherapie</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Legt fest, welche bestehenden App-Funktionen die Rolle nutzen
                darf.
              </p>
            </Field>
          </div>
          <Button type="submit" disabled={loading || !label.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Rolle anlegen
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Verfügbare Rollen</h2>
          </div>
        </div>
        <div className="divide-y divide-border">
          {roles.map((role) => (
            <div
              key={role.key}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{role.label}</p>
                  {role.is_system ? (
                    <Badge>
                      <ShieldCheck className="h-3 w-3" />
                      Systemrolle
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Basis: {baseRoleLabels[role.base_role]}
                </p>
              </div>
              {!role.is_system ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Rolle löschen"
                  onClick={() => setDeleteTarget(role)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Rolle löschen?"
        description="Die Rolle kann nur gelöscht werden, wenn sie keinem Konto, keiner Seite und keiner Nachricht mehr zugewiesen ist."
        detail={deleteTarget?.label}
        confirmLabel={loading ? "Wird gelöscht …" : "Rolle löschen"}
        onCancel={() => {
          if (!loading) setDeleteTarget(null);
        }}
        onConfirm={deleteRole}
      />
    </div>
  );
}
