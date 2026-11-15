import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export async function setOrganizationAuthOtpCopySetting(
  organizationId: string,
  enabled: boolean,
) {
  const admin = await requirePlatformSessionAdmin();
  if (!organizationId.trim() || typeof enabled !== "boolean") {
    throw new Error("Select a valid organization OTP email copy setting.");
  }

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, send_auth_otp_to_credencecraft: true },
    });
    if (!organization) throw new Error("Organization not found.");

    const previousValue = organization.send_auth_otp_to_credencecraft;
    if (previousValue === enabled) return enabled;

    await transaction.organization.update({
      where: { id: organization.id },
      data: { send_auth_otp_to_credencecraft: enabled },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_ORGANIZATION_AUTH_OTP_COPY_SETTING_UPDATED",
        entity_type: "Organization",
        entity_id: organization.id,
        details: {
          sendAuthOtpToCredencecraft: {
            before: previousValue,
            after: enabled,
          },
        },
      },
    });
    return enabled;
  });
}
