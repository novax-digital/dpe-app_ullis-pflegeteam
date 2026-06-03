import { SettingsPage } from "@/components/settings-page";
import { getUserContext } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function SettingsRoute() {
  const { profile } = await getUserContext();

  return <SettingsPage profile={profile} />;
}
