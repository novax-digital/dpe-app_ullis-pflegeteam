import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { NewsDetailPage } from "@/components/news-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import type { Database } from "@/lib/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MessageDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getUserContext();

  if (!context.user) {
    redirect("/login");
  }

  if (!hasAllowedRole(context.roles, ["admin", "employee", "physiotherapy"])) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: item } = await supabase
    .from("news")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!item || (!context.roles.includes("admin") && !item.published)) {
    notFound();
  }

  const commentResult = await supabase
    .from("news_comments")
    .select("*")
    .eq("news_id", id)
    .order("created_at", { ascending: true });
  const comments = commentResult.data ?? [];
  const profileIds = Array.from(
    new Set([
      item.author_id,
      ...comments.map((comment) => comment.author_id),
    ]),
  );
  let profiles: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "full_name" | "email"
  >[] = [];

  if (profileIds.length > 0) {
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", profileIds);
      profiles = data ?? [];
    } catch {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", profileIds);
      profiles = data ?? [];
    }
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const authorProfile = profileById.get(item.author_id);
  const author =
    authorProfile?.full_name?.trim() ||
    authorProfile?.email?.trim() ||
    "Unbekannter Autor";

  return (
    <NewsDetailPage
      item={item}
      author={author}
      comments={comments}
      commentProfiles={profiles}
      isAdmin={context.roles.includes("admin")}
      userId={context.user.id}
    />
  );
}
