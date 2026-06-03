import { AccessDenied } from "@/components/access-denied";
import { EBikesPage } from "@/components/e-bikes-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EBikesRoute() {
  const context = await getUserContext();

  if (!hasAllowedRole(context.roles, ["admin", "employee"])) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const isAdmin = context.roles.includes("admin");
  const [bikesResult, reservationsResult, profilesResult] = await Promise.all([
    supabase.from("ebikes").select("*").order("name"),
    supabase
      .from("ebike_reservations")
      .select("*")
      .order("start_time", { ascending: true }),
    isAdmin
      ? supabase.from("profiles").select("id, full_name, email")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <EBikesPage
      initialBikes={bikesResult.data ?? []}
      initialReservations={reservationsResult.data ?? []}
      initialProfiles={profilesResult.data ?? []}
      isAdmin={isAdmin}
      userId={context.user!.id}
    />
  );
}
