import { redirect } from "next/navigation";
import { getEffectiveSegmentRestrictions } from "@/lib/services/platform/segment-restriction-service";
import { getSidebarFeatureKeysForRoute, restrictionMatchesRoute } from "@/lib/services/platform/plan-restriction-matcher";

export async function validateOrganizationAccess(
  organization: { id: string; organization_id: string; pricing_mode: string },
  currentPath: string,
  trialIsActive?: boolean,
) {
  if (!currentPath) {
    throw new Error("Unable to determine the current organization route.");
  }

  try {
    const segments = currentPath.split("/").filter(Boolean);
    const dashboardIndex = segments.indexOf("dashboard");
    const workspaceId = dashboardIndex !== -1 ? segments[dashboardIndex + 1] : "";

    const orgIndex = segments.indexOf("organizations");
    const moduleSegments = orgIndex !== -1 ? segments.slice(orgIndex + 2) : [];

    const restrictions = organization.pricing_mode === "USER_BASED"
      ? []
      : await getEffectiveSegmentRestrictions(organization.id, trialIsActive);

    if (moduleSegments.length === 0 || restrictions.length === 0) return restrictions;
    const featureKeys = getSidebarFeatureKeysForRoute(moduleSegments);

    for (const rule of restrictions) {
      const isBlockType = rule.restriction_type === "block" || rule.restriction_type === "BLOCK";
      if (isBlockType) {
        if (restrictionMatchesRoute(rule, moduleSegments, featureKeys)) {
          const blockMessage = rule.custom_message || "This feature is not available for your current version and segment.";
          
          // Prevent infinite loops if already on the access-blocked page
          if (currentPath.includes("/access-blocked")) {
            return restrictions;
          }

          const redirectUrl = workspaceId
            ? `/dashboard/${workspaceId}/organizations/${organization.organization_id}/access-blocked?message=${encodeURIComponent(blockMessage)}`
            : `/dashboard/organizations/${organization.organization_id}/access-blocked?message=${encodeURIComponent(blockMessage)}`;
            
          redirect(redirectUrl);
        }
      }
    }

    return restrictions;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error && String(error.digest).includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Error validating organization access:", error);
    throw error;
  }
}