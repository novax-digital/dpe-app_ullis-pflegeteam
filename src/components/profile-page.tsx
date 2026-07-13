"use client";

import { FormEvent, useMemo, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button, Card, Field, Input, Label, Notice, PageHeader } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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

export function ProfilePage({ email }: { email: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (verificationError) {
      setLoading(false);
      setMessage(passwordError(verificationError.message));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

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
      <PageHeader title="Mein Konto" eyebrow="Sicherheit" />
      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

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
            <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </Field>
          <Field>
            <Label htmlFor="new-password">Neues Passwort</Label>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen</p>
          </Field>
          <Field>
            <Label htmlFor="confirm-password">Neues Passwort wiederholen</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Passwort ändern
          </Button>
        </form>
      </Card>
    </div>
  );
}
