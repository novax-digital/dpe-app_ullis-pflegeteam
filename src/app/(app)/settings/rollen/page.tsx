import { AccessDenied } from "@/components/access-denied";
import { RolesSettingsPage } from "@/components/roles-settings-page";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RolesSettingsRoute() {
  const context = await getUserContext();

  if (!context.roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: roles } = await supabase
    .from("app_roles")
    .select("*")
    .order("is_system", { ascending: false })
    .order("label", { ascending: true });

  return <RolesSettingsPage initialRoles={roles ?? []} />;
}
