import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import {
  primaryRoleFrom,
  type AppRole,
  type AppRoleDefinition,
  type Profile,
} from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserContext = {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  assignedRoles: AppRole[];
  roleDefinitions: AppRoleDefinition[];
  primaryRole: AppRole | null;
  primaryRoleLabel: string;
};

export const getUserContext = cache(async (): Promise<UserContext> => {
  if (!hasSupabaseEnv) {
    return {
      user: null,
      profile: null,
      roles: [],
      assignedRoles: [],
      roleDefinitions: [],
      primaryRole: null,
      primaryRoleLabel: "Team",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      roles: [],
      assignedRoles: [],
      roleDefinitions: [],
      primaryRole: null,
      primaryRoleLabel: "Team",
    };
  }

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const assignedRoles = (roleRows ?? []).map((row) => row.role);
  const { data: roleDefinitions } = assignedRoles.length
    ? await supabase.from("app_roles").select("*").in("key", assignedRoles)
    : { data: [] as AppRoleDefinition[] };
  const definitions = (roleDefinitions ?? []) as AppRoleDefinition[];
  const roles = Array.from(
    new Set([
      ...assignedRoles,
      ...definitions.map((definition) => definition.base_role),
    ]),
  );
  const primaryRole = primaryRoleFrom(assignedRoles);
  const primaryRoleLabel = primaryRole
    ? definitions.find((definition) => definition.key === primaryRole)?.label ??
      primaryRole
    : "Team";

  return {
    user,
    profile: profile ?? null,
    roles,
    assignedRoles,
    roleDefinitions: definitions,
    primaryRole,
    primaryRoleLabel,
  };
});
