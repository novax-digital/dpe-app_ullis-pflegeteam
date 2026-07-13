import { ProfilePage } from "@/components/profile-page";
import { getUserContext } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function ProfileRoute() {
  const context = await getUserContext();
  return <ProfilePage email={context.user?.email ?? context.profile?.email ?? ""} />;
}
