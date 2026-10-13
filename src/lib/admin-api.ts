import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireApiAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert.", status: 401 as const };
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return { error: (error as Error).message, status: 500 as const };
  }

  const { data: adminRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminRole) {
    return {
      error: "Nur Administrator:innen dürfen diese Funktion verwenden.",
      status: 403 as const,
    };
  }

  return { user, admin };
}
