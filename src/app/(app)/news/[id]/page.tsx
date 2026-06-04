import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { NewsDetailPage } from "@/components/news-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import type { Database } from "@/lib/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewsDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getUserContext();

  if (!hasAllowedRole(context.roles, ["admin", "employee"])) {
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

  let authorProfile: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "full_name" | "email"
  > | null = null;

  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", item.author_id)
      .maybeSingle();
    authorProfile = data;
  } catch {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", item.author_id)
      .maybeSingle();
    authorProfile = data;
  }

  const author =
    authorProfile?.full_name?.trim() ||
    authorProfile?.email?.trim() ||
    "Unbekannter Autor";

  return (
    <NewsDetailPage
      item={item}
      author={author}
      isAdmin={context.roles.includes("admin")}
    />
  );
}
