import { AccessDenied } from "@/components/access-denied";
import { EBikeFleetPage } from "@/components/e-bikes-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EBikeFleetRoute() {
  const context = await getUserContext();

  if (!context.user || !hasAllowedRole(context.roles, ["admin", "employee"])) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("ebikes").select("*").order("name");

  return (
    <EBikeFleetPage
      initialBikes={data ?? []}
      isAdmin={context.roles.includes("admin")}
    />
  );
}
