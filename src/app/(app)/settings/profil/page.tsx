import { SettingsPage } from "@/components/settings-page";
import { getUserContext } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function SettingsProfileRoute() {
  const { profile, roles } = await getUserContext();

  return (
    <SettingsPage
      mode="profile"
      profile={profile}
      isAdmin={roles.includes("admin")}
    />
  );
}
