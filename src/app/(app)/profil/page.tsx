import { ProfilePage } from "@/components/profile-page";
import { getUserContext } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function ProfileRoute() {
  const context = await getUserContext();
  return (
    <ProfilePage
      userId={context.user?.id ?? ""}
      fullName={context.profile?.full_name ?? ""}
      email={context.user?.email ?? context.profile?.email ?? ""}
      position={context.profile?.position ?? ""}
      isAdmin={context.roles.includes("admin")}
    />
  );
}
