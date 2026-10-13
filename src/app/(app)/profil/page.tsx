import { ProfilePage } from "@/components/profile-page";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfileRoute() {
  const context = await getUserContext();
  const supabase = await createSupabaseServerClient();
  const { data: positions } = await supabase
    .from("app_positions")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  return (
    <ProfilePage
      userId={context.user?.id ?? ""}
      fullName={context.profile?.full_name ?? ""}
      email={context.user?.email ?? context.profile?.email ?? ""}
      position={context.profile?.position ?? ""}
      positionDefinitions={positions ?? []}
      isAdmin={context.roles.includes("admin")}
    />
  );
}
