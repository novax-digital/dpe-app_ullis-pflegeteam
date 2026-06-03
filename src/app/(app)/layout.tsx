import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getUserContext } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getUserContext();

  if (!context.user) {
    redirect("/login");
  }

  return (
    <AppShell
      profile={context.profile}
      roles={context.roles}
      primaryRole={context.primaryRole}
    >
      {children}
    </AppShell>
  );
}
