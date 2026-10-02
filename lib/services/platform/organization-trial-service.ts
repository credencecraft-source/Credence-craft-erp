import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import type { Prisma } from "@prisma/client";

const DEFAULT_TRIAL_HOURS = 24;
const MAX_TRIAL_EXTENSION_HOURS = 8760;
const HOUR_IN_MS = 60 * 60 * 1000;

async function startOrganizationTrial(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  actor: { workspaceUserId: string } | { platformAdminId: string },
) {
  const organization = await transaction.organization.findUnique({
    where: { id: organizationId },
    select: {
      approval_status: true,
      trial_started_at: true,
      trial_enabled: true,
      trial_extension_hours: true,
    },
  });
  if (!organization || organization.approval_status !== "APPROVED" || !organization.trial_enabled || organization.trial_started_at) return;

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + (DEFAULT_TRIAL_HOURS + organization.trial_extension_hours) * HOUR_IN_MS);
  const started = await transaction.organization.updateMany({
    where: { id: organizationId, approval_status: "APPROVED", trial_started_at: null, trial_enabled: true },
    data: { trial_started_at: startedAt, trial_ends_at: endsAt },
  });
  if (started.count !== 1) return;

  const details = { startedAt: startedAt.toISOString(), trialEnd: endsAt.toISOString() };
  if ("platformAdminId" in actor) {
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: actor.platformAdminId,
        action: "ORGANIZATION_TRIAL_STARTED",
        entity_type: "Organization",
        entity_id: organizationId,
        details,
      },
    });
  } else {
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: actor.workspaceUserId,
        module: "subscription",
        action: "ORGANIZATION_TRIAL_STARTED",
        entity_type: "Organization",
        entity_id: organizationId,
        details,
      },
    });
  }
}

export async function startOrganizationTrialOnApproval(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  platformAdminId: string,
) {
  await startOrganizationTrial(transaction, organizationId, { platformAdminId });
}

export async function startOrganizationTrialOnFirstOpen(organizationId: string, workspaceUserId: string) {
  await prisma.$transaction((transaction) => startOrganizationTrial(transaction, organizationId, { workspaceUserId }));
}

export async function isOrganizationTrialActive(organizationId: string, now = new Date()) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { trial_started_at: true, trial_ends_at: true, trial_enabled: true },
  });

  return Boolean(
    organization?.trial_enabled
    && organization.trial_started_at
    && organization.trial_ends_at
    && organization.trial_ends_at > now,
  );
}

export async function hasOrganizationTrialAccess(organizationId: string, now = new Date()) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { trial_started_at: true, trial_ends_at: true, trial_enabled: true },
  });
  if (!organization) return false;

  if (organization.trial_enabled && (!organization.trial_started_at || Boolean(organization.trial_ends_at && organization.trial_ends_at > now))) {
    return true;
  }

  const effectivePlans = await getEffectivePlansForOrganization(organizationId);
  return effectivePlans.some(({ plan, isFree }) => Boolean(plan) && !isFree);
}

export async function extendOrganizationTrial(organizationId: string, extensionHours: number) {
  const admin = await requirePlatformSessionAdmin();
  if (!organizationId.trim()) throw new Error("Select an organization.");
  if (!Number.isInteger(extensionHours) || extensionHours < 1 || extensionHours > MAX_TRIAL_EXTENSION_HOURS) {
    throw new Error(`Trial extension must be between 1 and ${MAX_TRIAL_EXTENSION_HOURS} hours.`);
  }

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        trial_started_at: true,
        trial_ends_at: true,
        trial_enabled: true,
        trial_extension_hours: true,
      },
    });
    if (!organization) throw new Error("Organization not found.");

    const now = new Date();
    const data = organization.trial_started_at
      ? {
          trial_enabled: true,
          trial_ends_at: new Date(Math.max(organization.trial_ends_at?.getTime() ?? 0, now.getTime()) + extensionHours * HOUR_IN_MS),
        }
      : {
          trial_enabled: true,
          trial_extension_hours: organization.trial_extension_hours + extensionHours,
        };
    const updatedOrganization = await transaction.organization.update({
      where: { id: organization.id },
      data,
      select: { trial_started_at: true, trial_ends_at: true, trial_enabled: true, trial_extension_hours: true },
    });

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "ORGANIZATION_TRIAL_EXTENDED",
        entity_type: "Organization",
        entity_id: organization.id,
        details: {
          extensionHours,
          previousTrialEnd: organization.trial_ends_at?.toISOString() ?? null,
          trialEnd: updatedOrganization.trial_ends_at?.toISOString() ?? null,
          configuredExtensionHours: updatedOrganization.trial_extension_hours,
        },
      },
    });
    return updatedOrganization;
  });
}

export async function removeOrganizationTrial(organizationId: string) {
  const admin = await requirePlatformSessionAdmin();
  if (!organizationId.trim()) throw new Error("Select an organization.");

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, trial_enabled: true, trial_ends_at: true },
    });
    if (!organization) throw new Error("Organization not found.");
    if (!organization.trial_enabled) return organization;

    const updatedOrganization = await transaction.organization.update({
      where: { id: organization.id },
      data: { trial_enabled: false },
      select: { id: true, trial_enabled: true, trial_ends_at: true },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "ORGANIZATION_TRIAL_REMOVED",
        entity_type: "Organization",
        entity_id: organization.id,
        details: { previousTrialEnd: organization.trial_ends_at?.toISOString() ?? null },
      },
    });
    return updatedOrganization;
  });
}