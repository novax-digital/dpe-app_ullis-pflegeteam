import type { Database } from "@/lib/database.types";

export type SystemRole = Database["public"]["Enums"]["app_role"];
export type AppRole = string;
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppRoleDefinition = Database["public"]["Tables"]["app_roles"]["Row"];

export const ROLE_LABEL: Record<SystemRole, string> = {
  admin: "Administration",
  employee: "Mitarbeitende:r",
  physiotherapy: "Physiopraxis",
};

const systemRolePriority: SystemRole[] = [
  "admin",
  "physiotherapy",
  "employee",
];

export function primaryRoleFrom(roles: AppRole[]) {
  if (roles.includes("admin")) return "admin";

  const customRole = roles.find(
    (role) => !systemRolePriority.includes(role as SystemRole),
  );

  return (
    customRole ??
    systemRolePriority.find((role) => roles.includes(role)) ??
    null
  );
}

export function roleLabel(
  role: AppRole | null | undefined,
  definitions: Pick<AppRoleDefinition, "key" | "label">[] = [],
) {
  if (!role) return "Team";
  return (
    definitions.find((definition) => definition.key === role)?.label ??
    ROLE_LABEL[role as SystemRole] ??
    role
  );
}

export function hasAllowedRole(
  roles: AppRole[],
  allowed: AppRole[] | undefined,
) {
  if (!allowed || allowed.length === 0) return true;
  return roles.some((role) => allowed.includes(role));
}
