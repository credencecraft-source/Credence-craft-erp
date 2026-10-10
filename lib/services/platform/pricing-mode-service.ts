import { Prisma } from "@prisma/client";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export const PRICING_MODES = ["MODULE_BASED", "USER_BASED"] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export type PlatformPricingSettings = {
  id: string;
  module_based_active: boolean;
  user_based_active: boolean;
  user_monthly_price: Prisma.Decimal;
};

export function isPricingModeEnabled(
  settings: Pick<PlatformPricingSettings, "module_based_active" | "user_based_active" | "user_monthly_price">,
  mode: string,
) {
  if (mode === "MODULE_BASED") return settings.module_based_active;
  if (mode === "USER_BASED") {
    return settings.user_based_active && settings.user_monthly_price.greaterThan(0);
  }
  return false;
}

export async function getPlatformPricingSettings(
  database: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PlatformPricingSettings> {
  return database.platformPricingSettings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
}

export function parseUserMonthlyPrice(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a non-negative per-user price with up to two decimal places.");
  }
  return new Prisma.Decimal(normalized);
}

export async function updatePlatformPricingSettings(input:
  | { mode: PricingMode; isActive: boolean }
  | { userMonthlyPrice: string },
) {
  const admin = await requirePlatformSessionAdmin();
  const pricingSettings = await prisma.$transaction(async (transaction) => {
    const current = await getPlatformPricingSettings(transaction);
    let data: Prisma.PlatformPricingSettingsUpdateInput;

    if ("mode" in input) {
      if (!PRICING_MODES.includes(input.mode)) throw new Error("Select a valid pricing mode.");
      if (input.mode === "USER_BASED" && input.isActive && current.user_monthly_price.lessThanOrEqualTo(0)) {
        throw new Error("Set a per-user monthly price greater than zero before activating this pricing mode.");
      }
      if (!input.isActive) {
        const organizationsUsingMode = await transaction.organization.count({
          where: { pricing_mode: input.mode },
        });
        if (organizationsUsingMode > 0) {
          throw new Error("This pricing mode is assigned to organizations and cannot be deactivated.");
        }
      }
      data = input.mode === "MODULE_BASED"
        ? { module_based_active: input.isActive, updated_by_platform_admin_id: admin.id }
        : { user_based_active: input.isActive, updated_by_platform_admin_id: admin.id };
    } else {
      const userMonthlyPrice = parseUserMonthlyPrice(input.userMonthlyPrice);
      if (current.user_based_active && userMonthlyPrice.lessThanOrEqualTo(0)) {
        throw new Error("The per-user rate must be greater than zero while User Based Pricing is active.");
      }
      data = {
        user_monthly_price: userMonthlyPrice,
        updated_by_platform_admin_id: admin.id,
      };
    }

    const updated = await transaction.platformPricingSettings.update({
      where: { id: current.id },
      data,
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_PRICING_SETTINGS_UPDATED",
        entity_type: "PlatformPricingSettings",
        entity_id: updated.id,
        details: "mode" in input
          ? {
              mode: input.mode,
              isActive: input.isActive,
              userMonthlyPrice: updated.user_monthly_price.toString(),
            }
          : {
              mode: "USER_BASED",
              userMonthlyPrice: updated.user_monthly_price.toString(),
            },
      },
    });
    return updated;
  });
  return pricingSettings;
}

export async function setOrganizationPricingMode(organizationId: string, mode: PricingMode) {
  const admin = await requirePlatformSessionAdmin();
  if (!PRICING_MODES.includes(mode)) throw new Error("Select a valid pricing mode.");

  return prisma.$transaction(async (transaction) => {
    const settings = await getPlatformPricingSettings(transaction);
    if (!isPricingModeEnabled(settings, mode)) {
      throw new Error("This pricing mode is currently unavailable.");
    }

    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, pricing_mode: true },
    });
    if (!organization) throw new Error("Organization not found.");

    const updated = await transaction.organization.update({
      where: { id: organization.id },
      data: { pricing_mode: mode },
      select: { id: true, pricing_mode: true },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "ORGANIZATION_PRICING_MODE_UPDATED",
        entity_type: "Organization",
        entity_id: organization.id,
        details: { previousMode: organization.pricing_mode, pricingMode: mode },
      },
    });
    return updated;
  });
}

export async function countActiveOrganizationMembers(organizationId: string) {
  return prisma.organizationMembership.count({
    where: { organization_id: organizationId, is_active: true },
  });
}

export async function countOrganizationMembers(organizationId: string) {
  return prisma.organizationMembership.count({
    where: { organization_id: organizationId },
  });
}
