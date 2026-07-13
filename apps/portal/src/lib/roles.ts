import type { Href } from "expo-router";

import type { Role } from "@/stores/authStore";

/** The home route for each role's stack. */
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
