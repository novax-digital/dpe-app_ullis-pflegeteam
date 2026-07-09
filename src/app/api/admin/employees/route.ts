import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { sendInviteEmail } from "@/lib/auth-emails";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedRoles: AppRole[] = ["admin", "employee", "physiotherapy"];

export async function POST(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Nicht authentifiziert." },
      { status: 401 },
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

  const { data: adminRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminRole) {
    return NextResponse.json(
      { error: "Nur Administrator:innen duerfen Konten anlegen." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const position = String(body.position ?? "").trim();
  const role = String(body.role ?? "employee") as AppRole;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Ungültige E-Mail-Adresse." },
      { status: 400 },
    );
  }

  if (!fullName) {
    return NextResponse.json({ error: "Name ist erforderlich." }, { status: 400 });
  }

  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
  }

  const { data: invite, error: inviteError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: appUrl("/einladung"),
        data: {
          full_name: fullName,
          position: position || null,
          role,
        },
      },
    });

  if (inviteError || !invite.user || !invite.properties?.hashed_token) {
    return NextResponse.json(
      { error: inviteError?.message ?? "Einladungslink konnte nicht erstellt werden." },
      { status: 400 },
    );
  }

  await admin.from("profiles").upsert({
    id: invite.user.id,
    full_name: fullName,
    email,
    position: position || null,
  });

  await admin.from("user_roles").delete().eq("user_id", invite.user.id);
  await admin.from("user_roles").insert({
    user_id: invite.user.id,
    role,
  });

  try {
    await sendInviteEmail({
      email,
      fullName,
      role,
      tokenHash: invite.properties.hashed_token,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Konto wurde angelegt, aber die Einladung konnte nicht versendet werden: ${error.message}`
            : "Konto wurde angelegt, aber die Einladung konnte nicht versendet werden.",
        user_id: invite.user.id,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ user_id: invite.user.id });
}
