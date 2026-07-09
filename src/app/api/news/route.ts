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

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const title = textValue(body.title, 180);
  const content = textValue(body.content, 12000);
  const notificationRequested = Boolean(body.send_notification);

  if (!title) {
    return errorResponse("Titel ist erforderlich.", 400);
  }

  const now = new Date().toISOString();
  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", user.id),
    admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const authorIsAdmin = (roleRows ?? []).some((row) => row.role === "admin");

  if (notificationRequested && !authorIsAdmin) {
    return errorResponse(
      "Nur Administrator:innen dürfen E-Mail-Benachrichtigungen versenden.",
      403,
    );
  }

  const author =
    profile?.full_name?.trim() ||
    profile?.email?.trim() ||
    user.email?.trim() ||
    "Unbekannter Autor";

  const { data: item, error } = await admin
    .from("news")
    .insert({
      title,
      content,
      author_id: user.id,
      category: nullableTextValue(body.category, 80),
      excerpt: nullableTextValue(body.excerpt, 260),
      image_urls: imageUrlsValue(body.image_urls),
      published: true,
      published_at: now,
    })
    .select("*")
    .single();

  if (error || !item) {
    return errorResponse(error?.message ?? "Nachricht konnte nicht gespeichert werden.", 400);
  }

  const notification = await notifyAdminNewsIfNeeded({
    admin,
    item,
    author,
    authorIsAdmin,
    requested: notificationRequested,
  });

  return NextResponse.json({ item, notification });
}
