import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/admin-api";
import {
  CUSTOM_PAGE_FILE_BUCKET,
  customPageSlug,
} from "@/lib/custom-pages";
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
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
    .update({
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
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      {
        error:
          error?.code === "23505"
            ? "Diese URL wird bereits von einer anderen Seite verwendet."
            : error?.message ?? "Seite konnte nicht gespeichert werden.",
      },
      { status: error ? 400 : 404 },
    );
  }

  return NextResponse.json({ page: data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const { data: files } = await auth.admin
    .from("custom_page_files")
    .select("file_path")
    .eq("page_id", id);
  const paths = (files ?? []).map((file) => file.file_path);

  if (paths.length > 0) {
    const { error: storageError } = await auth.admin.storage
      .from(CUSTOM_PAGE_FILE_BUCKET)
      .remove(paths);
    if (storageError) {
      return NextResponse.json(
        { error: `PDF-Dateien konnten nicht gelöscht werden: ${storageError.message}` },
        { status: 400 },
      );
    }
  }

  const { error } = await auth.admin.from("custom_pages").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
