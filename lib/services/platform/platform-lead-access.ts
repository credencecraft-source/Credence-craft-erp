import type { PlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { requirePlatformNavigationPermission } from "@/lib/auth/platform-session-manager";

export async function requirePlatformLeadAccess() {
  return requirePlatformNavigationPermission("canAccessLeads");
}

export function getPlatformLeadScope(admin: PlatformSessionAdmin) {
  return admin.actualRole !== "SUPER_ADMIN" && admin.team_role === "SALES_MANAGER"
    ? { assigned_sales_manager_id: admin.id }
    : {};
}

export function getPlatformLeadReadScope(admin: PlatformSessionAdmin) {
  return admin.actualRole !== "SUPER_ADMIN" && admin.team_role === "SALES_MANAGER"
    ? {
      OR: [
        { assigned_sales_manager_id: null },
        { assigned_sales_manager_id: admin.id },
      ],
    }
    : {};
}

export function getPlatformLeadAssignedReadScope(admin: PlatformSessionAdmin) {
  return admin.actualRole !== "SUPER_ADMIN" && admin.team_role === "SALES_MANAGER"
    ? { assigned_sales_manager_id: { not: null } }
    : {};
}

export function isPlatformSalesManager(admin: PlatformSessionAdmin) {
  return admin.actualRole !== "SUPER_ADMIN" && admin.team_role === "SALES_MANAGER";
}
