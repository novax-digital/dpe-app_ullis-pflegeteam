import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import {
  primaryRoleFrom,
  type AppRole,
  type Profile,
} from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserContext = {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
};

export const getUserContext = cache(async (): Promise<UserContext> => {
  if (!hasSupabaseEnv) {
    return { user: null, profile: null, roles: [], primaryRole: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, roles: [], primaryRole: null };
  }

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const roles = (roleRows ?? []).map((row) => row.role);

  return {
    user,
    profile: profile ?? null,
    roles,
    primaryRole: primaryRoleFrom(roles),
  };
});
