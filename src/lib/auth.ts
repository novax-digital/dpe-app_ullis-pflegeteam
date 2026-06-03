import type { Database } from "@/lib/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administration",
  employee: "Mitarbeitende:r",
  physiotherapy: "Physiopraxis",
};

const rolePriority: AppRole[] = ["admin", "physiotherapy", "employee"];

export function primaryRoleFrom(roles: AppRole[]) {
  return rolePriority.find((role) => roles.includes(role)) ?? null;
}

export function hasAllowedRole(
  roles: AppRole[],
  allowed: AppRole[] | undefined,
) {
  if (!allowed || allowed.length === 0) return true;
  return roles.some((role) => allowed.includes(role));
}
