"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Button, Card, Field, Input, Label, Notice } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabaseEnv } from "@/lib/supabase/env";

type PasswordActionType = "invite" | "recovery";

const copyByType = {
  invite: {
    title: "Passwort einrichten",
    description:
      "Deine Einladung wurde geprüft. Vergib jetzt dein Passwort für Ullis Connect.",
    verifying: "Einladung wird geprüft...",
    button: "Passwort speichern",
    success: "Dein Passwort wurde gespeichert. Du wirst weitergeleitet.",
    invalid:
      "Der Einladungslink ist ungültig oder abgelaufen. Bitte wende dich an die Administration.",
  },
  recovery: {
    title: "Passwort zurücksetzen",
    description:
      "Dein Reset-Link wurde geprüft. Vergib jetzt ein neues Passwort.",
    verifying: "Reset-Link wird geprüft...",
    button: "Neues Passwort speichern",
    success: "Dein Passwort wurde geändert. Du wirst weitergeleitet.",
    invalid:
      "Der Reset-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.",
  },
} satisfies Record<PasswordActionType, Record<string, string>>;

export function AuthPasswordActionPage({
  type,
}: {
  type: PasswordActionType;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const verifyStartedRef = useRef(false);
  const copy = copyByType[type];

  useEffect(() => {
    if (verifyStartedRef.current) return;
    verifyStartedRef.current = true;

    async function verifyLink() {
      setMessage(null);

      if (!hasSupabaseEnv) {
        setMessage("Supabase ist noch nicht konfiguriert.");
        setVerifying(false);
        return;
      }

      const tokenHash = searchParams.get("token_hash");
      const linkType = searchParams.get("type");

      if (!tokenHash || (linkType && linkType !== type)) {
        setMessage(copy.invalid);
        setVerifying(false);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        setMessage(copy.invalid);
        setVerifying(false);
        return;
      }

      setVerified(true);
      setVerifying(false);
    }

    verifyLink();
  }, [copy.invalid, searchParams, supabase, type]);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    if (password.length < 8) {
      setMessage("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (password !== passwordConfirm) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess(copy.success);
    window.setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 900);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <Image
            src="/ullis-logo.png"
            alt="Ullis Pflegeteam"
            width={44}
            height={44}
            className="rounded-full bg-white object-contain"
            priority
          />
          <div>
            <p className="font-semibold">Ullis Connect</p>
            <p className="text-xs text-muted-foreground">Mitarbeiterportal</p>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {verified ? copy.description : copy.verifying}
          </p>
        </div>

        <Card className="p-5">
          {verifying ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.verifying}
            </div>
          ) : null}

          {!verifying && message ? <Notice tone="danger">{message}</Notice> : null}

          {!verifying && verified ? (
            <form onSubmit={savePassword} className="space-y-4">
              {success ? <Notice tone="success">{success}</Notice> : null}

              <Field>
                <Label htmlFor="new-password">Neues Passwort</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="new-password-confirm">
                  Neues Passwort wiederholen
                </Label>
                <Input
                  id="new-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  required
                />
              </Field>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || Boolean(success)}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {copy.button}
              </Button>
            </form>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
