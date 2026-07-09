"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { KeyRound, Loader2, LogIn } from "lucide-react";
import { Button, Card, Field, Input, Label, Notice } from "@/components/ui";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);
    setSubmitting(true);

    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: resetEmail }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    setSubmitting(false);

    if (!response.ok) {
      setMessage(body.error ?? "Die Anfrage konnte nicht verarbeitet werden.");
      return;
    }

    setSuccess(
      "Wenn ein Konto zu dieser E-Mail existiert, wurde ein Link zum Zurücksetzen versendet.",
    );
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/ullis-logo.png"
            alt="Ullis Pflegeteam"
            width={48}
            height={48}
            className="rounded-full bg-white object-contain"
            priority
          />
          <div>
            <p className="text-lg font-semibold">Ullis Pflegeteam</p>
            <p className="text-sm opacity-80">Mitarbeiterportal</p>
          </div>
        </div>

        <div className="max-w-lg space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-normal">
            Ullis Connect
          </h1>
          <p className="text-base leading-7 opacity-90">
            Pinnwand, Gesundheitskurse, E-Bike-Buchungen und Teamverwaltung an
            einem zentralen Ort.
          </p>
        </div>

        <p className="text-sm opacity-70">
          © {new Date().getFullYear()} Ullis Pflegeteam
        </p>
      </section>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
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
            <h2 className="text-2xl font-semibold">Anmelden</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Konten werden intern durch die Administration angelegt."
                : "Wir senden dir einen Link zum Zurücksetzen deines Passworts."}
            </p>
          </div>

          {!hasSupabaseEnv ? (
            <Notice tone="danger">
              Supabase ist noch nicht konfiguriert. Befülle zuerst die Werte
              aus `.env.example`.
            </Notice>
          ) : null}

          <Card className="p-5">
            {mode === "login" ? (
              <form onSubmit={onSubmit} className="space-y-4">
                <Field>
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Field>
                  <Label htmlFor="password">Passwort</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>

                {message ? <Notice tone="danger">{message}</Notice> : null}
                {success ? <Notice tone="success">{success}</Notice> : null}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !hasSupabaseEnv}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  Anmelden
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMode("reset");
                    setMessage(null);
                    setSuccess(null);
                    setResetEmail(email);
                  }}
                >
                  Passwort vergessen?
                </Button>
              </form>
            ) : (
              <form onSubmit={requestPasswordReset} className="space-y-4">
                <Field>
                  <Label htmlFor="reset-email">E-Mail</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                  />
                </Field>

                {message ? <Notice tone="danger">{message}</Notice> : null}
                {success ? <Notice tone="success">{success}</Notice> : null}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !hasSupabaseEnv}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Link anfordern
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMode("login");
                    setMessage(null);
                    setSuccess(null);
                  }}
                >
                  Zur Anmeldung
                </Button>
              </form>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
