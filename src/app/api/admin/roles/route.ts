import { NextResponse } from "next/server";
import type { SystemRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedBaseRoles: SystemRole[] = ["employee", "physiotherapy"];

function roleKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("de")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

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
      error: "Nur Administrator:innen dürfen Rollen verwalten.",
      status: 403 as const,
    };
  }

  return { admin };
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

  const body = await request.json().catch(() => ({}));
  const label = String(body.label ?? "").trim().slice(0, 80);
  const key = roleKey(String(body.key ?? label));
  const baseRole = String(body.base_role ?? "employee") as SystemRole;

  if (!label || key.length < 2) {
    return NextResponse.json(
      { error: "Bitte einen gültigen Rollennamen eingeben." },
      { status: 400 },
    );
  }

  if (!allowedBaseRoles.includes(baseRole)) {
    return NextResponse.json(
      { error: "Ungültige Basisberechtigung." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.admin
    .from("app_roles")
    .insert({ key, label, base_role: baseRole, is_system: false })
    .select("*")
    .single();

  if (error || !data) {
    const duplicate = error?.code === "23505";
    return NextResponse.json(
      {
        error: duplicate
          ? "Eine Rolle mit diesem Namen existiert bereits."
          : error?.message ?? "Rolle konnte nicht angelegt werden.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ role: data });
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
  const key = String(body.key ?? "").trim();
  const { data: role } = await auth.admin
    .from("app_roles")
    .select("key, label, is_system")
    .eq("key", key)
    .maybeSingle();

  if (!role) {
    return NextResponse.json(
      { error: "Rolle wurde nicht gefunden." },
      { status: 404 },
    );
  }

  if (role.is_system) {
    return NextResponse.json(
      { error: "Systemrollen können nicht gelöscht werden." },
      { status: 400 },
    );
  }

  const [assignments, pages, news] = await Promise.all([
    auth.admin.from("user_roles").select("id").eq("role", key).limit(1),
    auth.admin
      .from("custom_pages")
      .select("id")
      .contains("visible_to_roles", [key])
      .limit(1),
    auth.admin
      .from("news")
      .select("id")
      .contains("audience_roles", [key])
      .limit(1),
  ]);

  if (assignments.data?.length || pages.data?.length || news.data?.length) {
    return NextResponse.json(
      {
        error:
          "Die Rolle wird noch von Konten, Seiten oder Nachrichten verwendet und kann deshalb nicht gelöscht werden.",
      },
      { status: 409 },
    );
  }

  const { error } = await auth.admin.from("app_roles").delete().eq("key", key);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
