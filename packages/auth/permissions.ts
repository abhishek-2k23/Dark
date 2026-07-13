import type { Role } from "@repo/database";

/**
 * Numeric permission levels with breathable gaps between values, so future
 * roles can slot in without renumbering (e.g. a COMMITTEE_MEMBER at 250 or a
 * SUPER_ADMIN at 400). Higher number = more privileged.
 */
export const PermissionLevel = {
  RESIDENT: 100,
  GUARD: 200,
  ADMIN: 300,
} as const satisfies Record<Role, number>;

export type PermissionLevelValue =
  (typeof PermissionLevel)[keyof typeof PermissionLevel];

export function permissionLevelOf(role: Role): PermissionLevelValue {
  return PermissionLevel[role];
}

/** True when `role` sits at or above the given minimum level. */
export function hasMinPermission(role: Role, minLevel: number): boolean {
  return PermissionLevel[role] >= minLevel;
}
