import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import {
  AUTOMATIC_TRIAL_EXTENSION_DESCRIPTION_PREFIX,
  LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION,
  PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX,
  TRIAL_EXTENSION_REQUEST_SUBJECT,
} from "@/lib/services/organizations/trial-extension-request-constants";
import { Prisma } from "@prisma/client";

const DEFAULT_TRIAL_HOURS = 24;
const MAX_TRIAL_EXTENSION_HOURS = 8760;
const HOUR_IN_MS = 60 * 60 * 1000;
export const ORGANIZATION_TRIAL_ACCESS_ENDED_MESSAGE =
  "Your 24-hour organization trial has ended. Activate a subscription or contact the platform administrator.";

export function shouldRedirectExpiredTrialRequest(currentPath: string, organizationPath: string) {
  const defaultOrganizationRoute = `${organizationPath}/order-management/merchandising/order`;
  return currentPath !== defaultOrganizationRoute
    && !currentPath.startsWith(`${organizationPath}/settings`)
    && !currentPath.includes("/access-blocked");
}
const TRIAL_AUDIT_ACTIONS = [
  "ORGANIZATION_TRIAL_STARTED",
  "ORGANIZATION_TRIAL_EXTENDED",
  "ORGANIZATION_TRIAL_AUTO_EXTENDED",
  "ORGANIZATION_TRIAL_REMOVED",
] as const;
const OPEN_TRIAL_REQUEST_STATUSES = ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"] as const;

type PlatformTrialExtensionRequest = {
  id: string;
  organization_id: string | null;
  request_type: string;
  subject: string;
  description: string;
  status: string;
};

function isPlatformTrialExtensionRequest(
  ticket: PlatformTrialExtensionRequest | null,
): ticket is PlatformTrialExtensionRequest & { organization_id: string } {
  return Boolean(
    ticket?.organization_id
    && ticket.request_type === "TICKET"
    && ticket.subject === TRIAL_EXTENSION_REQUEST_SUBJECT
    && (ticket.description.startsWith(PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX)
      || ticket.description === LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION)
    && OPEN_TRIAL_REQUEST_STATUSES.includes(ticket.status as typeof OPEN_TRIAL_REQUEST_STATUSES[number]),
  );
}

type OrganizationTrialHistoryEntry = {
  id: string;
  occurredAt: Date;
  title: string;
  description: string;
  actor: string | null;
  status?: string;
};

function readAuditDetail(details: unknown, key: string): unknown {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return (details as Record<string, unknown>)[key];
}

function readAuditDate(details: unknown, key: string): Date | null {
  const value = readAuditDetail(details, key);
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function listOrganizationTrialHistory(organizationId: string) {
  await requirePlatformSessionAdmin();
  const [organization, workspaceAuditEvents, platformAuditEvents, requests] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, created_at: true },
    }),
    prisma.auditEvent.findMany({
      where: {
        organization_id: organizationId,
        entity_type: "Organization",
        entity_id: organizationId,
        action: { in: [...TRIAL_AUDIT_ACTIONS] },
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        action: true,
        details: true,
        created_at: true,
        user: { select: { full_name: true, email: true } },
      },
    }),
    prisma.platformAuditEvent.findMany({
      where: {
        entity_type: "Organization",
        entity_id: organizationId,
        action: { in: [...TRIAL_AUDIT_ACTIONS] },
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        action: true,
        details: true,
        created_at: true,
        platformAdmin: { select: { full_name: true, email: true } },
      },
    }),
    prisma.supportTicket.findMany({
      where: {
        organization_id: organizationId,
        subject: TRIAL_EXTENSION_REQUEST_SUBJECT,
        request_type: "TICKET",
        OR: [
          { description: { startsWith: AUTOMATIC_TRIAL_EXTENSION_DESCRIPTION_PREFIX } },
          { description: { startsWith: PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX } },
          { description: LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION },
        ],
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        ticket_number: true,
        description: true,
        status: true,
        created_at: true,
        updated_at: true,
        submittedBy: { select: { full_name: true, email: true } },
      },
    }),
  ]);
  if (!organization) throw new Error("Organization not found.");

  const transitions = [
    ...workspaceAuditEvents.map((event) => ({ ...event, source: "workspace" as const })),
    ...platformAuditEvents.map((event) => ({ ...event, source: "platform" as const })),
  ].sort((left, right) => left.created_at.getTime() - right.created_at.getTime());

  const history: OrganizationTrialHistoryEntry[] = [{
    id: `organization-created-${organization.id}`,
    occurredAt: organization.created_at,
    title: "Organisation created",
    description: "The organisation record was created.",
    actor: null,
  }];

  for (const event of transitions) {
    const details = event.details;
    const trialEnd = readAuditDate(details, "trialEnd");
    const previousTrialEnd = readAuditDate(details, "previousTrialEnd");
    const extensionHours = readAuditDetail(details, "extensionHours");
    const action = event.action;
    const actorRecord = event.source === "workspace" ? event.user : event.platformAdmin;
    const actor = actorRecord ? actorRecord.full_name || actorRecord.email : null;
    const title = action === "ORGANIZATION_TRIAL_STARTED"
      ? event.source === "workspace" ? "Trial started on first organisation open" : "Trial started on approval"
      : action === "ORGANIZATION_TRIAL_AUTO_EXTENDED"
        ? "Automatic trial extension granted"
        : action === "ORGANIZATION_TRIAL_EXTENDED"
          ? "Trial extended by platform administrator"
          : "Trial removed";
    const description = action === "ORGANIZATION_TRIAL_STARTED"
      ? `Trial started${trialEnd ? `; scheduled to end ${trialEnd.toLocaleString()}` : ""}.`
      : action === "ORGANIZATION_TRIAL_AUTO_EXTENDED"
        ? `Automatic ${typeof extensionHours === "number" ? `${extensionHours}-hour` : "trial"} extension granted${trialEnd ? `; new end ${trialEnd.toLocaleString()}` : ""}.`
        : action === "ORGANIZATION_TRIAL_EXTENDED"
          ? `Administrator added ${typeof extensionHours === "number" ? `${extensionHours} hours` : "time"}${previousTrialEnd ? `; previous end ${previousTrialEnd.toLocaleString()}` : ""}${trialEnd ? `; new end ${trialEnd.toLocaleString()}` : ""}.`
          : "Trial access was disabled by the platform administrator.";

    history.push({
      id: `${event.source}-${event.id}`,
      occurredAt: event.created_at,
      title,
      description,
      actor,
    });
  }

  transitions.forEach((event, index) => {
    if (event.action !== "ORGANIZATION_TRIAL_STARTED"
      && event.action !== "ORGANIZATION_TRIAL_EXTENDED"
      && event.action !== "ORGANIZATION_TRIAL_AUTO_EXTENDED") return;

    const trialEnd = readAuditDate(event.details, "trialEnd");
    if (!trialEnd) return;
    const nextTrialTransition = transitions.slice(index + 1).find((next) =>
      next.action === "ORGANIZATION_TRIAL_STARTED"
      || next.action === "ORGANIZATION_TRIAL_EXTENDED"
      || next.action === "ORGANIZATION_TRIAL_AUTO_EXTENDED"
      || next.action === "ORGANIZATION_TRIAL_REMOVED");
    const endedBeforeNextChange = nextTrialTransition
      ? trialEnd <= nextTrialTransition.created_at
      : trialEnd <= new Date();
    if (endedBeforeNextChange) {
      history.push({
        id: `trial-expired-${event.id}`,
        occurredAt: trialEnd,
        title: "Trial expired",
        description: "The trial period ended before another extension was applied.",
        actor: null,
      });
    }
  });

  for (const request of requests) {
    const automaticGrant = request.description.startsWith(AUTOMATIC_TRIAL_EXTENSION_DESCRIPTION_PREFIX);
    history.push({
      id: `request-${request.id}`,
      occurredAt: request.created_at,
      title: automaticGrant ? "Automatic extension request recorded" : "Platform extension requested",
      description: request.description,
      actor: request.submittedBy?.full_name || request.submittedBy?.email || "Workspace User",
      status: automaticGrant
        ? "Automatically granted"
        : ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"].includes(request.status)
          ? "Awaiting platform review"
          : request.status.replaceAll("_", " "),
    });
  }

  history.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  return { events: history, requests };
}

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
  await prisma.$transaction(
    (transaction) => startOrganizationTrial(transaction, organizationId, { workspaceUserId }),
    { maxWait: 10000, timeout: 20000 },
  );
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

type OrganizationTrialAccessSnapshot = {
  trial_started_at: Date | null;
  trial_ends_at: Date | null;
  trial_enabled: boolean;
};

export async function hasOrganizationTrialAccess(
  organizationId: string,
  now = new Date(),
  snapshot?: OrganizationTrialAccessSnapshot,
) {
  const organization = snapshot ?? await prisma.organization.findUnique({
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

async function extendOrganizationTrialInTransaction(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  extensionHours: number,
  platformAdminId: string,
) {
  if (!Number.isInteger(extensionHours) || extensionHours < 1 || extensionHours > MAX_TRIAL_EXTENSION_HOURS) {
    throw new Error(`Trial extension must be between 1 and ${MAX_TRIAL_EXTENSION_HOURS} hours.`);
  }

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
  await transaction.supportTicket.updateMany({
    where: {
      organization_id: organization.id,
      subject: TRIAL_EXTENSION_REQUEST_SUBJECT,
      request_type: "TICKET",
      status: { in: [...OPEN_TRIAL_REQUEST_STATUSES] },
      OR: [
        { description: { startsWith: PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX } },
        { description: LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION },
      ],
    },
    data: { status: "RESOLVED" },
  });

  await transaction.platformAuditEvent.create({
    data: {
      platform_admin_id: platformAdminId,
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
}

export async function extendOrganizationTrial(organizationId: string, extensionHours: number) {
  const admin = await requirePlatformSessionAdmin();
  if (!organizationId.trim()) throw new Error("Select an organization.");

  return prisma.$transaction(
    (transaction) => extendOrganizationTrialInTransaction(transaction, organizationId, extensionHours, admin.id),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 },
  );
}

export async function approveOrganizationTrialExtensionRequest(ticketId: string, extensionHours: number) {
  const admin = await requirePlatformSessionAdmin();
  if (!ticketId.trim()) throw new Error("Select a trial extension request.");
  if (!Number.isInteger(extensionHours) || extensionHours < 1 || extensionHours > MAX_TRIAL_EXTENSION_HOURS) {
    throw new Error(`Trial extension must be between 1 and ${MAX_TRIAL_EXTENSION_HOURS} hours.`);
  }

  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        organization_id: true,
        request_type: true,
        subject: true,
        description: true,
        status: true,
      },
    });
    if (!isPlatformTrialExtensionRequest(ticket)) {
      throw new Error("This ticket is not an open trial extension request.");
    }

    const claimed = await transaction.supportTicket.updateMany({
      where: {
        id: ticket.id,
        organization_id: ticket.organization_id,
        subject: TRIAL_EXTENSION_REQUEST_SUBJECT,
        request_type: "TICKET",
        status: { in: [...OPEN_TRIAL_REQUEST_STATUSES] },
        OR: [
          { description: { startsWith: PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX } },
          { description: LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION },
        ],
      },
      data: { status: "RESOLVED" },
    });
    if (claimed.count !== 1) {
      throw new Error("This trial extension request has already been processed.");
    }

    return extendOrganizationTrialInTransaction(transaction, ticket.organization_id, extensionHours, admin.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
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