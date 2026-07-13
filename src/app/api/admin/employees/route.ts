import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/auth";
import { emailAppUrl } from "@/lib/app-url";
import { sendInviteEmail } from "@/lib/auth-emails";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedRoles: AppRole[] = ["admin", "employee", "physiotherapy"];

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert.", status: 401 as const };
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return { error: (error as Error).message, status: 500 as const };
  }

  const { data: adminRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminRole) {
    return {
      error: "Nur Administrator:innen dürfen Konten verwalten.",
      status: 403 as const,
    };
  }

  return { user, admin };
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { admin } = auth;

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
        redirectTo: emailAppUrl("/einladung"),
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

export async function PATCH(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const position = String(body.position ?? "").trim();
  const role = String(body.role ?? "") as AppRole;

  if (!userId) {
    return NextResponse.json({ error: "Benutzer-ID fehlt." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Name ist erforderlich." }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Ungültige E-Mail-Adresse." },
      { status: 400 },
    );
  }
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
  }

  if (userId === auth.user.id && role !== "admin") {
    return NextResponse.json(
      { error: "Die eigene Admin-Rolle kann hier nicht geändert werden." },
      { status: 400 },
    );
  }

  const { data: existing, error: userError } =
    await auth.admin.auth.admin.getUserById(userId);
  if (userError || !existing.user) {
    return NextResponse.json(
      { error: userError?.message ?? "Benutzerkonto wurde nicht gefunden." },
      { status: 404 },
    );
  }

  const previousEmail = existing.user.email ?? "";
  const previousMetadata = existing.user.user_metadata;
  const { error: authUpdateError } =
    await auth.admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      user_metadata: {
        ...previousMetadata,
        full_name: fullName,
        position: position || null,
      },
    });

  if (authUpdateError) {
    return NextResponse.json(
      { error: `Konto konnte nicht aktualisiert werden: ${authUpdateError.message}` },
      { status: 400 },
    );
  }

  const { error: profileError } = await auth.admin
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      position: position || null,
    })
    .eq("id", userId);

  if (profileError) {
    await auth.admin.auth.admin.updateUserById(userId, {
      email: previousEmail || undefined,
      email_confirm: true,
      user_metadata: previousMetadata,
    });
    return NextResponse.json(
      { error: `Profil konnte nicht aktualisiert werden: ${profileError.message}` },
      { status: 400 },
    );
  }

  const { error: roleInsertError } = await auth.admin
    .from("user_roles")
    .upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );

  if (roleInsertError) {
    return NextResponse.json(
      { error: `Rolle konnte nicht aktualisiert werden: ${roleInsertError.message}` },
      { status: 400 },
    );
  }

  const { error: oldRolesError } = await auth.admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .neq("role", role);

  if (oldRolesError) {
    return NextResponse.json(
      { error: `Alte Rolle konnte nicht entfernt werden: ${oldRolesError.message}` },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id ?? "").trim();

  if (!userId) {
    return NextResponse.json(
      { error: "Benutzer-ID fehlt." },
      { status: 400 },
    );
  }

  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: "Das eigene Konto kann hier nicht gelöscht werden." },
      { status: 400 },
    );
  }

  const { error } = await auth.admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json(
      { error: `Konto konnte nicht gelöscht werden: ${error.message}` },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
