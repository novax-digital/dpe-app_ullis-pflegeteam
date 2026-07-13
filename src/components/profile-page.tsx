"use client";

import { FormEvent, useMemo, useState } from "react";
import { KeyRound, Loader2, UserRound } from "lucide-react";
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

function passwordError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Das bisherige Passwort ist nicht korrekt.";
  }
  if (lower.includes("same password")) {
    return "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.";
  }
  return message;
}

export function ProfilePage({
  userId,
  fullName,
  email,
  position,
  isAdmin,
}: {
  userId: string;
  fullName: string;
  email: string;
  position: string;
  isAdmin: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [accountFullName, setAccountFullName] = useState(fullName);
  const [accountEmail, setAccountEmail] = useState(email);
  const [loginEmail, setLoginEmail] = useState(email);
  const [accountPosition, setAccountPosition] = useState(position);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || profileLoading) return;

    setMessage(null);
    setSuccess(null);
    setProfileLoading(true);

    const response = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        full_name: accountFullName,
        email: accountEmail,
        position: accountPosition,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setProfileLoading(false);
      setMessage(body.error ?? "Änderungen konnten nicht gespeichert werden.");
      return;
    }

    await supabase.auth.refreshSession();
    setLoginEmail(accountEmail.trim().toLowerCase());
    setProfileLoading(false);
    setSuccess("Deine Kontodaten wurden aktualisiert.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setMessage("Das neue Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    if (currentPassword === newPassword) {
      setMessage("Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.");
      return;
    }

    setPasswordLoading(true);
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: currentPassword,
    });

    if (verificationError) {
      setPasswordLoading(false);
      setMessage(passwordError(verificationError.message));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setPasswordLoading(false);

    if (updateError) {
      setMessage(passwordError(updateError.message));
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess("Dein Passwort wurde erfolgreich geändert.");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Mein Konto" eyebrow="Profil und Sicherheit" />
      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Kontodaten</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deine bei Ullis Connect hinterlegten Angaben.
            </p>
          </div>
        </div>

        {isAdmin ? (
          <form onSubmit={saveProfile} className="space-y-4">
            <Field>
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={accountFullName}
                onChange={(event) => setAccountFullName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="profile-email">E-Mail-Adresse</Label>
              <Input
                id="profile-email"
                type="email"
                value={accountEmail}
                onChange={(event) => setAccountEmail(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Eine neue Adresse wird anschließend auch für deine Anmeldung verwendet.
              </p>
            </Field>
            <Field>
              <Label htmlFor="profile-position">Berufsbezeichnung</Label>
              <Select
                id="profile-position"
                value={accountPosition}
                onChange={(event) => setAccountPosition(event.target.value)}
              >
                <option value="">Keine Angabe</option>
                {accountPosition && !positions.includes(accountPosition) ? (
                  <option value={accountPosition}>{accountPosition}</option>
                ) : null}
                {positions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Kontodaten speichern
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">E-Mail-Adresse</dt>
                <dd className="mt-1 break-all font-medium">{accountEmail || "–"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Berufsbezeichnung</dt>
                <dd className="mt-1 font-medium">{accountPosition || "–"}</dd>
              </div>
            </dl>
            <Notice>
              Möchtest du deine E-Mail-Adresse oder Berufsbezeichnung ändern, wende dich bitte an eine Administratorin oder einen Administrator.
            </Notice>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Passwort ändern</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gib zur Bestätigung zuerst dein bisheriges Passwort ein.
            </p>
          </div>
        </div>

        <form onSubmit={changePassword} className="space-y-4">
          <Field>
            <Label htmlFor="current-password">Bisheriges Passwort</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>
          <Field>
            <Label htmlFor="new-password">Neues Passwort</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen</p>
          </Field>
          <Field>
            <Label htmlFor="confirm-password">Neues Passwort wiederholen</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={passwordLoading}>
            {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Passwort ändern
          </Button>
        </form>
      </Card>
    </div>
  );
}
