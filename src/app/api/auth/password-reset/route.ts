import { NextResponse } from "next/server";
import { emailAppUrl } from "@/lib/app-url";
import { sendPasswordResetEmail } from "@/lib/auth-emails";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function neutralResponse() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email || !validEmail(email)) {
    return NextResponse.json(
      { error: "Bitte gib eine gültige E-Mail-Adresse ein." },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: emailAppUrl("/passwort-zuruecksetzen"),
    },
  });

  if (error || !data.properties?.hashed_token) {
    return neutralResponse();
  }

  try {
    await sendPasswordResetEmail({
      email,
      tokenHash: data.properties.hashed_token,
    });
  } catch (error) {
    console.error("Password reset email failed", error);
  }

  return neutralResponse();
}
