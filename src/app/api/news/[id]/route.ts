import { NextResponse } from "next/server";
import { notifyAdminNewsIfNeeded } from "@/lib/news-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableTextValue(value: unknown, maxLength: number) {
  const text = textValue(value, maxLength);
  return text || null;
}

function imageUrlsValue(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseEnv) {
    return errorResponse("Supabase ist noch nicht konfiguriert.", 503);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse("Nicht authentifiziert.", 401);
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }

  const { id } = await context.params;
  const [{ data: existing }, { data: roleRows }] = await Promise.all([
    admin.from("news").select("*").eq("id", id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  if (!existing) {
    return errorResponse("Nachricht wurde nicht gefunden.", 404);
  }

  const isAdmin = (roleRows ?? []).some((row) => row.role === "admin");
  const isAuthor = existing.author_id === user.id;

  if (!isAdmin && !isAuthor) {
    return errorResponse("Keine Berechtigung für diese Nachricht.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const notificationRequested = Boolean(body.send_notification);
  const updates: {
    title?: string;
    content?: string;
    category?: string | null;
    excerpt?: string | null;
    image_urls?: string[];
    published?: boolean;
    published_at?: string | null;
  } = {};

  if (notificationRequested && !isAdmin) {
    return errorResponse(
      "Nur Administrator:innen dürfen E-Mail-Benachrichtigungen versenden.",
      403,
    );
  }

  if ("title" in body) {
    const title = textValue(body.title, 180);
    if (!title) {
      return errorResponse("Titel ist erforderlich.", 400);
    }
    updates.title = title;
  }

  if ("content" in body) {
    updates.content = textValue(body.content, 12000);
  }

  if ("category" in body) {
    updates.category = nullableTextValue(body.category, 80);
  }

  if ("excerpt" in body) {
    updates.excerpt = nullableTextValue(body.excerpt, 260);
  }

  if ("image_urls" in body) {
    updates.image_urls = imageUrlsValue(body.image_urls);
  }

  if ("published" in body) {
    if (!isAdmin) {
      return errorResponse("Nur Administrator:innen dürfen den Status ändern.", 403);
    }

    const published = Boolean(body.published);
    updates.published = published;
    updates.published_at = published
      ? existing.published_at ?? new Date().toISOString()
      : null;
  }

  if (Object.keys(updates).length === 0 && !notificationRequested) {
    return errorResponse("Keine Änderungen übermittelt.", 400);
  }

  let item = existing;

  if (Object.keys(updates).length > 0) {
    const { data: updatedItem, error } = await admin
      .from("news")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !updatedItem) {
      return errorResponse(
        error?.message ?? "Nachricht konnte nicht gespeichert werden.",
        400,
      );
    }

    item = updatedItem;
  }

  const authorWasAdmin = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", item.author_id)
    .eq("role", "admin")
    .maybeSingle();
  const { data: authorProfile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", item.author_id)
    .maybeSingle();
  const author =
    authorProfile?.full_name?.trim() ||
    authorProfile?.email?.trim() ||
    "Unbekannter Autor";
  const notification = await notifyAdminNewsIfNeeded({
    admin,
    item,
    author,
    authorIsAdmin: Boolean(authorWasAdmin.data),
    requested: notificationRequested,
  });

  return NextResponse.json({ item, notification });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseEnv) {
    return errorResponse("Supabase ist noch nicht konfiguriert.", 503);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse("Nicht authentifiziert.", 401);
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }

  const { id } = await context.params;
  const [{ data: existing }, { data: roleRows }] = await Promise.all([
    admin.from("news").select("id, author_id").eq("id", id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  if (!existing) {
    return errorResponse("Nachricht wurde nicht gefunden.", 404);
  }

  const isAdmin = (roleRows ?? []).some((row) => row.role === "admin");
  const isAuthor = existing.author_id === user.id;

  if (!isAdmin && !isAuthor) {
    return errorResponse("Keine Berechtigung für diese Nachricht.", 403);
  }

  const { error } = await admin.from("news").delete().eq("id", id);

  if (error) {
    return errorResponse(error.message, 400);
  }

  return NextResponse.json({ ok: true });
}
