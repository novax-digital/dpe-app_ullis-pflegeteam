import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/auth";
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
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const position = String(body.position ?? "").trim();
  const role = String(body.role ?? "employee") as AppRole;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Ungueltige E-Mail-Adresse." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 8 Zeichen lang sein." },
      { status: 400 },
    );
  }

  if (!fullName) {
    return NextResponse.json({ error: "Name ist erforderlich." }, { status: 400 });
  }

  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Ungueltige Rolle." }, { status: 400 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      position: position || null,
      role,
    },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Anlegen fehlgeschlagen." },
      { status: 400 },
    );
  }

  await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fullName,
    email,
    position: position || null,
  });

  await admin.from("user_roles").delete().eq("user_id", created.user.id);
  await admin.from("user_roles").insert({
    user_id: created.user.id,
    role,
  });

  return NextResponse.json({ user_id: created.user.id });
}
