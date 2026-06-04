import { AccessDenied } from "@/components/access-denied";
import { DocumentsPage } from "@/components/documents-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DocumentsRoute() {
  const context = await getUserContext();

  if (
    !context.user ||
    !hasAllowedRole(context.roles, ["admin", "employee", "physiotherapy"])
  ) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <DocumentsPage
      initialDocuments={data ?? []}
      isAdmin={context.roles.includes("admin")}
      userId={context.user.id}
    />
  );
}
