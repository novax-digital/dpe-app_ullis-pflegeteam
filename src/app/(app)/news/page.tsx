import { AccessDenied } from "@/components/access-denied";
import { NewsPage } from "@/components/news-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import type { Database } from "@/lib/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewsRoute() {
  const context = await getUserContext();

  if (!hasAllowedRole(context.roles, ["admin", "employee"])) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false });
  const items = data ?? [];
  const authorIds = Array.from(new Set(items.map((item) => item.author_id)));
  let profiles: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "full_name" | "email"
  >[] = [];

  if (authorIds.length > 0) {
    try {
      const admin = createSupabaseAdminClient();
      const { data: profileData } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      profiles = profileData ?? [];
    } catch {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      profiles = profileData ?? [];
    }
  }

  return (
    <NewsPage
      initialItems={items}
      initialProfiles={profiles}
      isAdmin={context.roles.includes("admin")}
      userId={context.user!.id}
    />
  );
}
