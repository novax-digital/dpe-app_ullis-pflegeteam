import { AccessDenied } from "@/components/access-denied";
import { CustomPagesSettingsPage } from "@/components/custom-pages-settings-page";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CustomPagesSettingsRoute() {
  const context = await getUserContext();

  if (!context.roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const [pagesResult, filesResult, rolesResult] = await Promise.all([
    supabase
      .from("custom_pages")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("custom_page_files")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("app_roles")
      .select("*")
      .order("is_system", { ascending: false })
      .order("label", { ascending: true }),
  ]);

  return (
    <CustomPagesSettingsPage
      initialPages={pagesResult.data ?? []}
      initialFiles={filesResult.data ?? []}
      roleDefinitions={rolesResult.data ?? []}
    />
  );
}
