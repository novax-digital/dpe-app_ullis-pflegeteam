import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/admin-api";
import { customPageSlug } from "@/lib/custom-pages";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function roleValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((role) => (typeof role === "string" ? role.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 50);
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
  const title = textValue(body.title, 180);
  const slug = customPageSlug(textValue(body.slug, 100) || title);
  const visibleToRoles = roleValues(body.visible_to_roles);

  if (!title || slug.length < 2) {
    return NextResponse.json(
      { error: "Titel und eine gültige URL sind erforderlich." },
      { status: 400 },
    );
  }

  if (visibleToRoles.length > 0) {
    const { data: validRoles } = await auth.admin
      .from("app_roles")
      .select("key")
      .in("key", visibleToRoles);
    if ((validRoles ?? []).length !== visibleToRoles.length) {
      return NextResponse.json(
        { error: "Mindestens eine ausgewählte Rolle ist ungültig." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await auth.admin
    .from("custom_pages")
    .insert({
      title,
      slug,
      summary: textValue(body.summary, 500) || null,
      content: textValue(body.content, 50000),
      visible_to_roles: visibleToRoles,
      published: body.published !== false,
      sort_order: Math.max(
        -9999,
        Math.min(9999, Math.trunc(Number(body.sort_order) || 0)),
      ),
      created_by: auth.user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        error:
          error?.code === "23505"
            ? "Diese URL wird bereits von einer anderen Seite verwendet."
            : error?.message ?? "Seite konnte nicht angelegt werden.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ page: data });
}
