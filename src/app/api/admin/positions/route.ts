import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/admin-api";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function normalizeLabel(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await requireApiAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const label = normalizeLabel(body.label);
  if (!label) {
    return NextResponse.json(
      { error: "Bitte eine Berufsbezeichnung eingeben." },
      { status: 400 },
    );
  }

  const { data: lastPosition } = await auth.admin
    .from("app_positions")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await auth.admin
    .from("app_positions")
    .insert({ label, sort_order: (lastPosition?.sort_order ?? -1) + 1 })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        error:
          error?.code === "23505"
            ? "Diese Berufsbezeichnung existiert bereits."
            : error?.message ?? "Berufsbezeichnung konnte nicht angelegt werden.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ position: data });
}

export async function PATCH(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await requireApiAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  const label = normalizeLabel(body.label);
  if (!id || !label) {
    return NextResponse.json(
      { error: "ID und Berufsbezeichnung sind erforderlich." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.admin
    .from("app_positions")
    .update({ label })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      {
        error:
          error?.code === "23505"
            ? "Diese Berufsbezeichnung existiert bereits."
            : error?.message ?? "Berufsbezeichnung wurde nicht gefunden.",
      },
      { status: error ? 400 : 404 },
    );
  }

  return NextResponse.json({ position: data });
}

export async function DELETE(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await requireApiAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("app_positions")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Berufsbezeichnung wurde nicht gefunden." },
      { status: error ? 400 : 404 },
    );
  }

  return NextResponse.json({ success: true });
}
