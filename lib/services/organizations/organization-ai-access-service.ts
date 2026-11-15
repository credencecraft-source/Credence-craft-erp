import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";

export async function setOrganizationAiEnabledByAdmin(
  workspaceUserId: string,
  publicOrganizationId: string,
  enabled: boolean,
) {
  if (!workspaceUserId.trim() || !publicOrganizationId.trim() || typeof enabled !== "boolean") {
    throw new Error("A valid organization, user, and AI access value are required.");
  }

  const membership = await requireOrganizationAccess(
    workspaceUserId,
    publicOrganizationId,
    ["OWNER", "ADMIN"],
  );

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findFirst({
      where: {
        id: membership.organization_id,
        organization_id: publicOrganizationId,
      },
      select: { id: true, ai_enabled: true },
    });
    if (!organization) throw new Error("Organization not found.");
    if (organization.ai_enabled === enabled) return organization;

    const updatedOrganization = await transaction.organization.update({
      where: { id: organization.id },
      data: { ai_enabled: enabled },
      select: { id: true, ai_enabled: true },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        module: "ai",
        action: "AI_COPILOT_ACCESS_UPDATED",
        entity_type: "Organization",
        entity_id: organization.id,
        details: {
          actorUserId: workspaceUserId,
          actorRole: membership.role,
          previousEnabled: organization.ai_enabled,
          enabled,
        },
      },
    });

    return updatedOrganization;
  });
}
