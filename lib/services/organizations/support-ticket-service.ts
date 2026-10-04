import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { normalizeSystemStatusKey } from "@/lib/auth/validation-rules";
import { requireOrganizationAccess } from "./organization-service";
import {
  AUTOMATIC_TRIAL_EXTENSION_DESCRIPTION_PREFIX,
  LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION,
  PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX,
  TRIAL_EXTENSION_REQUEST_SUBJECT,
} from "./trial-extension-request-constants";

const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const TICKET_STATUSES = ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const AUTOMATIC_TRIAL_EXTENSION_LIMIT = 3;
const AUTOMATIC_TRIAL_EXTENSION_HOURS = 24;
const HOUR_IN_MS = 60 * 60 * 1000;

export type SupportTicketStatus = (typeof TICKET_STATUSES)[number];

export async function createSupportTicket(input: {
  organizationId: string;
  submittedByUserId: string;
  subject: string;
  description: string;
  priority?: string;
  requestType?: string;
  callbackDate?: string;
  callbackTime?: string;
}) {
  const membership = await requireOrganizationAccess(input.submittedByUserId, input.organizationId);
  const normalized = normalizeTicketInput(input);
  const ticket = await prisma.$transaction(async (transaction) => {
    const createdTicket = await transaction.supportTicket.create({
      data: {
        id: randomUUID(),
        ticket_number: randomUUID(),
        organization_id: membership.organization_id,
        submitted_by_user_id: input.submittedByUserId,
        ...normalized,
      },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: input.submittedByUserId,
        module: "support",
        action: "SUPPORT_TICKET_CREATED",
        entity_type: "SupportTicket",
        entity_id: createdTicket.id,
        details: { subject: normalized.subject, requestType: normalized.request_type, priority: normalized.priority },
      },
    });
    return createdTicket;
  });
  return ticket;
}

function normalizeTicketInput(input: {
  subject: string;
  description: string;
  priority?: string;
  requestType?: string;
  callbackDate?: string;
  callbackTime?: string;
}) {
  const subject = input.subject.trim();
  const description = input.description.trim();
  const priority = (input.priority || "NORMAL").toUpperCase();
  const requestType = (input.requestType || "TICKET").toUpperCase();

  if (subject.length < 3 || subject.length > 255) throw new Error("Subject must be between 3 and 255 characters.");
  if (description.length < 10 || description.length > 5000) throw new Error("Description must be between 10 and 5000 characters.");
  if (!TICKET_PRIORITIES.includes(priority as (typeof TICKET_PRIORITIES)[number])) throw new Error("Select a valid priority.");
  if (requestType !== "TICKET" && requestType !== "CALLBACK") throw new Error("Select a valid support request type.");
  if (requestType === "CALLBACK") {
    if (!input.callbackDate || !input.callbackTime) throw new Error("Callback date and time are required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.callbackDate) || Number.isNaN(Date.parse(`${input.callbackDate}T00:00:00Z`))) {
      throw new Error("Select a valid callback date.");
    }
    const date = new Date(`${input.callbackDate}T00:00:00Z`);
    if (date.toISOString().slice(0, 10) !== input.callbackDate) throw new Error("Select a valid callback date.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.callbackTime)) throw new Error("Select a valid callback time.");
  }

  return {
    subject,
    description,
    priority,
    request_type: requestType,
    callback_date: requestType === "CALLBACK" ? input.callbackDate : null,
    callback_time: requestType === "CALLBACK" ? input.callbackTime : null,
  };
}

export async function listSupportTicketOrganizations() {
  const organizations = await prisma.organization.findMany({
    where: { is_active: true },
    orderBy: { organization_name: "asc" },
    select: {
      organization_id: true,
      organization_name: true,
      memberships: {
        where: { is_active: true },
        orderBy: { created_at: "asc" },
        select: {
          workspaceUser: { select: { id: true, full_name: true, email: true } },
        },
      },
    },
  });
  return organizations.map((organization) => ({
    organizationId: organization.organization_id,
    organizationName: organization.organization_name,
    contacts: organization.memberships.map((membership) => membership.workspaceUser),
  }));
}

export async function createPlatformSupportTicket(input: {
  organizationId: string;
  submittedByUserId: string;
  platformAdminId: string;
  subject: string;
  description: string;
  priority?: string;
  requestType?: string;
  callbackDate?: string;
  callbackTime?: string;
}) {
  const normalized = normalizeTicketInput(input);
  const organization = await prisma.organization.findFirst({
    where: {
      organization_id: input.organizationId,
      is_active: true,
      memberships: { some: { workspace_user_id: input.submittedByUserId, is_active: true } },
    },
    select: { id: true },
  });
  if (!organization) throw new Error("Select an active organization contact.");

  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.supportTicket.create({
      data: {
        id: randomUUID(),
        ticket_number: randomUUID(),
        organization_id: organization.id,
        submitted_by_user_id: input.submittedByUserId,
        created_by_platform_admin_id: input.platformAdminId,
        ...normalized,
      },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: input.platformAdminId,
        action: "SUPPORT_TICKET_CREATED_FOR_ORGANIZATION",
        entity_type: "SupportTicket",
        entity_id: ticket.id,
        details: {
          organizationId: organization.id,
          contactUserId: input.submittedByUserId,
          subject: normalized.subject,
          requestType: normalized.request_type,
          priority: normalized.priority,
        },
      },
    });
    return ticket;
  });
}

export async function createPlatformLeadSupportTicket(input: {
  leadId: string;
  subject: string;
  description: string;
  requestType?: string;
  callbackDate?: string;
  callbackTime?: string;
}) {
  const admin = await requirePlatformSessionAdmin();
  const normalized = normalizeTicketInput(input);
  const leadId = input.leadId.trim();
  if (!leadId || leadId.length > 255) throw new Error("Select a valid lead.");

  const lead = await prisma.platformLead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) throw new Error("Lead not found.");

  const ticketId = randomUUID();
  const ticket = prisma.supportTicket.create({
    data: {
      id: ticketId,
      ticket_number: randomUUID(),
      organization_id: null,
      submitted_by_user_id: null,
      platform_lead_id: lead.id,
      created_by_platform_admin_id: admin.id,
      ...normalized,
    },
  });
  const auditEvent = prisma.platformAuditEvent.create({
    data: {
      platform_admin_id: admin.id,
      action: "PLATFORM_LEAD_SUPPORT_TICKET_CREATED",
      entity_type: "SupportTicket",
      entity_id: ticketId,
      details: {
        requestType: normalized.request_type,
        callbackDate: normalized.callback_date,
        callbackTime: normalized.callback_time,
      },
    },
  });
  const [createdTicket] = await prisma.$transaction([ticket, auditEvent]);
  return createdTicket;
}

export async function listPlatformLeadSupportTickets(leadId: string) {
  await requirePlatformSessionAdmin();
  const id = leadId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid lead.");
  const lead = await prisma.platformLead.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!lead) throw new Error("Lead not found.");
  return prisma.supportTicket.findMany({
    where: { platform_lead_id: lead.id },
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    select: {
      id: true,
      ticket_number: true,
      subject: true,
      description: true,
      status: true,
      request_type: true,
      callback_date: true,
      callback_time: true,
      created_at: true,
      updated_at: true,
    },
  });
}

export async function requestExpiredTrialExtension(
  organizationId: string,
  submittedByUserId: string,
  now = new Date(),
) {
  const membership = await requireOrganizationAccess(submittedByUserId, organizationId);
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "organizations" WHERE "id" = ${membership.organization_id} FOR UPDATE
    `;

    const organization = await transaction.organization.findUnique({
      where: { id: membership.organization_id },
      select: {
        approval_status: true,
        trial_enabled: true,
        trial_started_at: true,
        trial_ends_at: true,
      },
    });

    if (
      !organization
      || organization.approval_status !== "APPROVED"
      || !organization.trial_enabled
      || !organization.trial_started_at
      || !organization.trial_ends_at
      || organization.trial_ends_at > now
    ) {
      throw new Error("A trial extension can only be requested after the trial expires.");
    }

    const existingRequest = await transaction.supportTicket.findFirst({
      where: {
        organization_id: membership.organization_id,
        subject: TRIAL_EXTENSION_REQUEST_SUBJECT,
        request_type: "TICKET",
        status: { in: ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"] },
        OR: [
          { description: { startsWith: PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX } },
          { description: LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION },
        ],
      },
    });
    if (existingRequest) {
      return { ticket: existingRequest, alreadyRequested: true, autoExtended: false, trialEndsAt: null };
    }

    const requestCount = await transaction.supportTicket.count({
      where: {
        organization_id: membership.organization_id,
        subject: TRIAL_EXTENSION_REQUEST_SUBJECT,
        request_type: "TICKET",
        description: { startsWith: AUTOMATIC_TRIAL_EXTENSION_DESCRIPTION_PREFIX },
      },
    });
    const autoExtended = requestCount < AUTOMATIC_TRIAL_EXTENSION_LIMIT;
    const trialEndsAt = autoExtended ? new Date(now.getTime() + AUTOMATIC_TRIAL_EXTENSION_HOURS * HOUR_IN_MS) : null;

    if (trialEndsAt) {
      const updated = await transaction.organization.updateMany({
        where: {
          id: membership.organization_id,
          trial_enabled: true,
          trial_ends_at: organization.trial_ends_at,
        },
        data: { trial_ends_at: trialEndsAt },
      });
      if (updated.count !== 1) throw new Error("The trial changed while the request was being processed. Please try again.");
    }

    const ticket = await transaction.supportTicket.create({
      data: {
        id: randomUUID(),
        ticket_number: randomUUID(),
        organization_id: membership.organization_id,
        submitted_by_user_id: submittedByUserId,
        request_type: "TICKET",
        subject: TRIAL_EXTENSION_REQUEST_SUBJECT,
        description: autoExtended
          ? `${AUTOMATIC_TRIAL_EXTENSION_DESCRIPTION_PREFIX}${requestCount + 1} of ${AUTOMATIC_TRIAL_EXTENSION_LIMIT} granted for 24 hours.`
          : `${PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX} were used. Please review this request for a trial extension.`,
        priority: "NORMAL",
        ...(autoExtended ? { status: "RESOLVED" } : {}),
      },
    });

    if (trialEndsAt) {
      await transaction.auditEvent.create({
        data: {
          organization_id: membership.organization_id,
          user_id: submittedByUserId,
          module: "subscription",
          action: "ORGANIZATION_TRIAL_AUTO_EXTENDED",
          entity_type: "Organization",
          entity_id: membership.organization_id,
          details: {
            requestNumber: requestCount + 1,
            extensionHours: AUTOMATIC_TRIAL_EXTENSION_HOURS,
            previousTrialEnd: organization.trial_ends_at.toISOString(),
            trialEnd: trialEndsAt.toISOString(),
          },
        },
      });
    }

    return { ticket, alreadyRequested: false, autoExtended, trialEndsAt };
  });
}

export async function listSupportTickets() {
  return prisma.supportTicket.findMany({
    include: {
      organization: { select: { organization_name: true, organization_id: true } },
      submittedBy: { select: { full_name: true, email: true } },
      platformLead: { select: { id: true, name: true, email: true, mobile: true, company_name: true } },
      createdByPlatformAdmin: { select: { full_name: true, email: true } },
    },
    orderBy: { created_at: "desc" },
  });
}

export async function getSupportTicket(id: string) {
  return prisma.supportTicket.findUnique({
    where: { id },
    include: {
      organization: { select: { organization_name: true, organization_id: true } },
      submittedBy: { select: { id: true, full_name: true, email: true } },
      platformLead: { select: { id: true, name: true, email: true, mobile: true, company_name: true } },
      messages: {
        orderBy: { created_at: "asc" },
        include: {
          workspaceUser: { select: { full_name: true, email: true } },
          platformAdmin: { select: { full_name: true, email: true } },
        },
      },
      createdByPlatformAdmin: { select: { full_name: true, email: true } },
    },
  });
}

export async function listSupportTicketsForUser(workspaceUserId: string) {
  return prisma.supportTicket.findMany({
    where: {
      organization: {
        is_active: true,
        memberships: { some: { workspace_user_id: workspaceUserId, is_active: true } },
      },
    },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      ticket_number: true,
      subject: true,
      status: true,
      request_type: true,
      created_at: true,
      updated_at: true,
      organization: { select: { organization_id: true, organization_name: true } },
    },
  });
}

export async function listSupportTicketsForOrganization(organizationId: string, workspaceUserId: string) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  return prisma.supportTicket.findMany({
    where: { organization_id: membership.organization_id },
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    select: {
      id: true,
      ticket_number: true,
      subject: true,
      description: true,
      priority: true,
      status: true,
      request_type: true,
      created_at: true,
      updated_at: true,
      submittedBy: { select: { full_name: true } },
    },
  });
}

export async function getSupportTicketForOrganization(organizationId: string, ticketId: string, workspaceUserId: string) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  return prisma.supportTicket.findFirst({
    where: { id: ticketId, organization_id: membership.organization_id },
    include: {
      organization: { select: { organization_name: true, organization_id: true } },
      submittedBy: { select: { id: true, full_name: true, email: true } },
      messages: {
        where: { sender_type: { not: "INTERNAL" } },
        orderBy: { created_at: "asc" },
        include: {
          workspaceUser: { select: { full_name: true, email: true } },
          platformAdmin: { select: { full_name: true, email: true } },
        },
      },
    },
  });
}

export async function getSupportTicketForUser(ticketId: string, workspaceUserId: string) {
  return prisma.supportTicket.findFirst({
    where: {
      id: ticketId,
      organization: {
        is_active: true,
        memberships: { some: { workspace_user_id: workspaceUserId, is_active: true } },
      },
    },
    include: {
      organization: { select: { organization_name: true, organization_id: true } },
      submittedBy: { select: { id: true, full_name: true, email: true } },
      messages: {
        where: { sender_type: { not: "INTERNAL" } },
        orderBy: { created_at: "asc" },
        include: {
          workspaceUser: { select: { full_name: true, email: true } },
          platformAdmin: { select: { full_name: true, email: true } },
        },
      },
    },
  });
}

export async function addWorkspaceTicketMessage(organizationId: string, ticketId: string, workspaceUserId: string, body: string) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, organization_id: membership.organization_id } });
  if (!ticket) throw new Error("Support ticket not found.");
  const cleanBody = body.trim();
  if (cleanBody.length < 1 || cleanBody.length > 5000) throw new Error("Message must be between 1 and 5000 characters.");
  return prisma.$transaction(async (transaction) => {
    const message = await transaction.ticketMessage.create({
      data: { support_ticket_id: ticketId, body: cleanBody, sender_type: "CUSTOMER", workspace_user_id: workspaceUserId },
    });
    await transaction.supportTicket.update({ where: { id: ticketId }, data: { updated_at: new Date() } });
    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: workspaceUserId,
        module: "support",
        action: "SUPPORT_TICKET_MESSAGE_ADDED",
        entity_type: "SupportTicket",
        entity_id: ticketId,
        details: { senderType: "CUSTOMER" },
      },
    });
    return message;
  });
}

export async function addPlatformTicketMessage(ticketId: string, platformAdminId: string, body: string, internal = false) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, organization_id: true, platform_lead_id: true },
  });
  if (!ticket) throw new Error("Support ticket not found.");
  if (ticket.platform_lead_id && !internal) {
    throw new Error("Lead follow-up tickets only support private platform notes.");
  }
  const cleanBody = body.trim();
  if (cleanBody.length < 1 || cleanBody.length > 5000) throw new Error("Message must be between 1 and 5000 characters.");
  return prisma.$transaction(async (transaction) => {
    const message = await transaction.ticketMessage.create({
      data: {
        support_ticket_id: ticketId,
        body: cleanBody,
        sender_type: internal ? "INTERNAL" : "PLATFORM",
        platform_admin_id: platformAdminId,
      },
    });
    await transaction.supportTicket.update({ where: { id: ticketId }, data: { updated_at: new Date() } });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: platformAdminId,
        action: internal ? "SUPPORT_TICKET_PRIVATE_NOTE_ADDED" : "SUPPORT_TICKET_REPLY_SENT",
        entity_type: "SupportTicket",
        entity_id: ticketId,
        details: { organizationId: ticket.organization_id },
      },
    });
    return message;
  });
}

export async function updateSupportTicketStatus(id: string, status: string, platformAdminId: string) {
  const normalizedStatus = normalizeSystemStatusKey(status) as SupportTicketStatus;
  if (!TICKET_STATUSES.includes(normalizedStatus)) throw new Error("Select a valid ticket status.");

  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.supportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!ticket) throw new Error("Support ticket not found.");
    const updated = await transaction.supportTicket.update({
      where: { id },
      data: { status: normalizedStatus },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: platformAdminId,
        action: "SUPPORT_TICKET_STATUS_UPDATED",
        entity_type: "SupportTicket",
        entity_id: id,
        details: { previousStatus: ticket.status, status: normalizedStatus },
      },
    });
    return updated;
  });
}

export async function getPlatformSupportAttentionCounts() {
  const [openTickets, pendingOrganizations, pendingSubscriptions] = await Promise.all([
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"] } } }),
    prisma.organization.count({ where: { is_active: true, approval_status: "PENDING_APPROVAL" } }),
    prisma.subscription.count({ where: { payment_status: { in: ["pending", "PENDING"] } } }),
  ]);
  return {
    openTickets,
    pendingOrganizations,
    pendingSubscriptions,
    total: openTickets + pendingOrganizations + pendingSubscriptions,
  };
}
