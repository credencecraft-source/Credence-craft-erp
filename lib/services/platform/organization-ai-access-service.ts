import { requirePlatformSessionSuperAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export async function setOrganizationAiEnabled(organizationId: string, enabled: boolean) {
  const admin = await requirePlatformSessionSuperAdmin();
  if (!organizationId.trim() || typeof enabled !== "boolean") {
    throw new Error("A valid organization and AI access value are required.");
  }

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
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
          platformAdminId: admin.id,
          previousEnabled: organization.ai_enabled,
          enabled,
        },
      },
    });

    return updatedOrganization;
  });
}
