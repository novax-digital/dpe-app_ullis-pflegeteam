import { AccessDenied } from "@/components/access-denied";
import { PositionsSettingsPage } from "@/components/positions-settings-page";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PositionsSettingsRoute() {
  const context = await getUserContext();

  if (!context.roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: positions } = await supabase
    .from("app_positions")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  return <PositionsSettingsPage initialPositions={positions ?? []} />;
}
