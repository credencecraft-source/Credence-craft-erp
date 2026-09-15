import prisma from "@/lib/database/prisma-client";
import { redirect } from "next/navigation";
import { getEffectiveSegmentRestrictions } from "@/lib/services/platform/segment-restriction-service";
import { getSidebarFeatureKeysForRoute, normalizeRestrictionPart, restrictionMatchesRoute } from "@/lib/services/platform/plan-restriction-matcher";

export async function validateOrganizationAccess(organizationId: string, currentPath: string) {
  if (!currentPath) {
    throw new Error("Unable to determine the current organization route.");
  }

  try {
    const segments = currentPath.split("/").filter(Boolean);
    const dashboardIndex = segments.indexOf("dashboard");
    const workspaceId = dashboardIndex !== -1 ? segments[dashboardIndex + 1] : "";

    const organization = await prisma.organization.findUnique({
      where: { organization_id: organizationId },
      select: { id: true },
    });

    if (!organization) {
      throw new Error("Organization not found while validating plan access.");
    }

    const orgIndex = segments.indexOf("organizations");
    const moduleSegments = orgIndex !== -1 ? segments.slice(orgIndex + 2) : [];

    if (moduleSegments.length === 0) return;


    const restrictions = await getEffectiveSegmentRestrictions(organization.id);

    if (restrictions.length === 0) return;
    const featureKeys = getSidebarFeatureKeysForRoute(moduleSegments);

    for (const rule of restrictions) {
      const isBlockType = rule.restriction_type === "block" || rule.restriction_type === "BLOCK";
      if (isBlockType) {
        if (restrictionMatchesRoute(rule, moduleSegments, featureKeys)) {
          const blockMessage = rule.custom_message || "This feature is not available for your current version and segment.";
          
          // Prevent infinite loops if already on the access-blocked page
          if (currentPath.includes("/access-blocked")) {
            return;
          }

          const redirectUrl = workspaceId 
            ? `/dashboard/${workspaceId}/organizations/${organizationId}/access-blocked?message=${encodeURIComponent(blockMessage)}`
            : `/dashboard/organizations/${organizationId}/access-blocked?message=${encodeURIComponent(blockMessage)}`;
            
          redirect(redirectUrl);
        }
      }
    }
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error && String(error.digest).includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Error validating organization access:", error);
    throw error;
  }
}