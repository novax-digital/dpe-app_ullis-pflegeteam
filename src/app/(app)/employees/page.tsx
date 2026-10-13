import { AccessDenied } from "@/components/access-denied";
import { EmployeesPage } from "@/components/employees-page";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeesRoute() {
  const context = await getUserContext();

  if (!context.roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const [profilesResult, rolesResult, roleDefinitionsResult, positionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("user_roles").select("*"),
    supabase
      .from("app_roles")
      .select("*")
      .order("is_system", { ascending: false })
      .order("label", { ascending: true }),
    supabase
      .from("app_positions")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
  ]);

  return (
    <EmployeesPage
      initialProfiles={profilesResult.data ?? []}
      initialRoles={rolesResult.data ?? []}
      roleDefinitions={roleDefinitionsResult.data ?? []}
      positionDefinitions={positionsResult.data ?? []}
      currentUserId={context.user?.id ?? ""}
    />
  );
}
