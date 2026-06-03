import { AccessDenied } from "@/components/access-denied";
import { NewsPage } from "@/components/news-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
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

  return (
    <NewsPage
      initialItems={data ?? []}
      isAdmin={context.roles.includes("admin")}
      userId={context.user!.id}
    />
  );
}
