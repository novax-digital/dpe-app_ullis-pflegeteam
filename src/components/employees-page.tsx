"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
}: {
  initialProfiles: Profile[];
  initialRoles: UserRole[];
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
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState(positions[2]);
  const [role, setRole] = useState<AppRole>("employee");

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
    setPassword("");
    setPosition(positions[2]);
    setRole("employee");
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setMessage("Name, E-Mail und ein Passwort mit mindestens 8 Zeichen sind erforderlich.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
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

    setSuccess("Mitarbeiter:in wurde angelegt.");
    resetForm();
    setShowForm(false);
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
                <Label htmlFor="employee-password">Passwort</Label>
                <Input
                  id="employee-password"
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
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
    </div>
  );
}
