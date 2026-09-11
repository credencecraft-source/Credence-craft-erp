import prisma from "@/lib/database/prisma-client";
import { redirect } from "next/navigation";

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

    const subscription = await prisma.subscription.findFirst({
      where: {
        organization_id: organization.id,
        payment_status: { in: ["paid", "PAID"] },
        OR: [{ end_date: null }, { end_date: { gt: new Date() } }],
      },
      select: { plan_id: true },
      orderBy: { created_at: "desc" },
    });

    if (!subscription || !subscription.plan_id) {
      return;
    }

    const restrictions = await prisma.plan_restrictions.findMany({
      where: { plan_id: subscription.plan_id },
    });

    if (!restrictions || restrictions.length === 0) {
      return;
    }

    const orgIndex = segments.indexOf("organizations");
    const moduleSegments = orgIndex !== -1 ? segments.slice(orgIndex + 2) : [];

    if (moduleSegments.length === 0) return;

    const currentMaster = (moduleSegments[0] || "").toLowerCase();
    const currentMain = (moduleSegments[1] || "").toLowerCase();
    const currentSub = (moduleSegments[2] || "").toLowerCase();

    for (const rule of restrictions) {
      const isBlockType = rule.restriction_type === "block" || rule.restriction_type === "BLOCK";
      if (isBlockType) {
        const ruleMaster = (rule.master_module || "").toLowerCase().replace(/\s+/g, "-");
        const ruleMain = (rule.main_module || "").toLowerCase().replace(/\s+/g, "-");
        const ruleSub = (rule.sub_module || "").toLowerCase().replace(/\s+/g, "-");

        const masterMatch = !ruleMaster || ruleMaster === "*" || ruleMaster === currentMaster;
        const mainMatch = !ruleMain || ruleMain === "*" || ruleMain === currentMain;
        const subMatch = !ruleSub || ruleSub === "*" || ruleSub === currentSub;

        const matches = masterMatch && (!ruleMain || mainMatch) && (!ruleSub || subMatch);
        const isAtOrBelowRule =
          (!ruleMaster || ruleMaster === "*" || ruleMaster === currentMaster) &&
          (!ruleMain || ruleMain === "*" || ruleMain === currentMain) &&
          (!ruleSub || ruleSub === "*" || currentSub === ruleSub);

        if (matches && isAtOrBelowRule) {
          const blockMessage = rule.custom_message || "Access to this module/feature is restricted by your current plan.";
          
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