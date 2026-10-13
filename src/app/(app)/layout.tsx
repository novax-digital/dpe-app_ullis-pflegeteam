import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();
  const { data: customPages } = await supabase
    .from("custom_pages")
    .select("id, slug, title")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  return (
    <AppShell
      profile={context.profile}
      roles={context.roles}
      primaryRoleLabel={context.primaryRoleLabel}
      customPages={customPages ?? []}
    >
      {children}
    </AppShell>
  );
}
