"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  Button,
  Card,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
  Select,
} from "@/components/ui";
import type { Profile } from "@/lib/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const positions = [
  "Pflegedienstleitung",
  "Stellv. Pflegedienstleitung",
  "Pflegefachkraft",
  "Pflegehelfer:in",
  "Verwaltung",
  "Auszubildende:r",
  "Sonstige",
];

export function SettingsPage({ profile }: { profile: Profile | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [position, setPosition] = useState(profile?.position ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    if (!profile) {
      setMessage("Profil konnte nicht geladen werden.");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        position: position || null,
      })
      .eq("id", profile.id);

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Profil gespeichert.");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Einstellungen" eyebrow="Mein Profil" />

      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <Card className="p-5">
        <form onSubmit={save} className="space-y-4">
          <Field>
            <Label htmlFor="settings-email">E-Mail</Label>
            <Input
              id="settings-email"
              value={profile?.email ?? ""}
              disabled
            />
          </Field>
          <Field>
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="settings-position">Berufsbezeichnung</Label>
            <Select
              id="settings-position"
              value={position}
              onChange={(event) => setPosition(event.target.value)}
            >
              <option value="">Nicht gesetzt</option>
              {positions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Speichern
          </Button>
        </form>
      </Card>
    </div>
  );
}
