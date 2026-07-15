import type { Href } from "expo-router";

import type { AuthUser, Role } from "@/stores/authStore";

/**
 * Where a signed-in user belongs. Every post-auth redirect routes through this,
 * so the society gate can't be sidestepped.
 *
 * A user with no `societyId` is signed in but has no society data to show —
 * a Google account created before anyone invited its email. They get held at
 * the waiting screen until an admin invites them.
 */
export function homeFor(
  user: Pick<AuthUser, "role" | "societyId"> | undefined,
): Href {
  if (user && !user.societyId) return "/no-society";
  return roleHome(user?.role);
}

/**
 * The home route for each role's stack. Prefer `homeFor`, which also accounts
 * for users who don't have a society yet.
 */
export function roleHome(role: Role | undefined): Href {
  switch (role) {
    case "GUARD":
      return "/(guard)";
    case "ADMIN":
      return "/(admin)";
    case "RESIDENT":
    default:
      return "/(resident)";
  }
}
