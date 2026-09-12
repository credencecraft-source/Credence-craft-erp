import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationAccess } from "./organization-service";

const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const TICKET_STATUSES = ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

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
  const subject = input.subject.trim();
  const description = input.description.trim();
  const priority = (input.priority || "NORMAL").toUpperCase();
  const requestType = (input.requestType || "TICKET").toUpperCase();

  if (subject.length < 3 || subject.length > 255) throw new Error("Subject must be between 3 and 255 characters.");
  if (description.length < 10 || description.length > 5000) throw new Error("Description must be between 10 and 5000 characters.");
  if (!TICKET_PRIORITIES.includes(priority as (typeof TICKET_PRIORITIES)[number])) throw new Error("Select a valid priority.");
  if (requestType !== "TICKET" && requestType !== "CALLBACK") throw new Error("Select a valid support request type.");
  if (requestType === "CALLBACK" && (!input.callbackDate || !input.callbackTime)) throw new Error("Callback date and time are required.");

  return prisma.supportTicket.create({
    data: {
      id: randomUUID(),
      ticket_number: randomUUID(),
      organization_id: membership.organization_id,
      submitted_by_user_id: input.submittedByUserId,
      request_type: requestType,
      subject,
      description,
      priority,
      callback_date: requestType === "CALLBACK" ? input.callbackDate : null,
      callback_time: requestType === "CALLBACK" ? input.callbackTime : null,
    },
  });
}

export async function listSupportTickets() {
  return prisma.supportTicket.findMany({
    include: {
      organization: { select: { organization_name: true, organization_id: true } },
      submittedBy: { select: { full_name: true, email: true } },
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
      messages: {
        orderBy: { created_at: "asc" },
        include: {
          workspaceUser: { select: { full_name: true, email: true } },
          platformAdmin: { select: { full_name: true, email: true } },
        },
      },
    },
  });
}

export async function listSupportTicketsForUser(workspaceUserId: string) {
  return prisma.supportTicket.findMany({
    where: { submitted_by_user_id: workspaceUserId },
    orderBy: { updated_at: "desc" },
    select: { id: true, ticket_number: true, subject: true, status: true, request_type: true, created_at: true, updated_at: true },
  });
}

export async function addWorkspaceTicketMessage(ticketId: string, workspaceUserId: string, body: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, submitted_by_user_id: workspaceUserId } });
  if (!ticket) throw new Error("Support ticket not found.");
  const cleanBody = body.trim();
  if (cleanBody.length < 1 || cleanBody.length > 5000) throw new Error("Message must be between 1 and 5000 characters.");
  return prisma.ticketMessage.create({ data: { support_ticket_id: ticketId, body: cleanBody, sender_type: "CUSTOMER", workspace_user_id: workspaceUserId } });
}

export async function addPlatformTicketMessage(ticketId: string, platformAdminId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) throw new Error("Support ticket not found.");
  const cleanBody = body.trim();
  if (cleanBody.length < 1 || cleanBody.length > 5000) throw new Error("Message must be between 1 and 5000 characters.");
  return prisma.ticketMessage.create({ data: { support_ticket_id: ticketId, body: cleanBody, sender_type: "PLATFORM", platform_admin_id: platformAdminId } });
}

export async function updateSupportTicketStatus(id: string, status: string) {
  const normalizedStatus = status.toUpperCase();
  if (!TICKET_STATUSES.includes(normalizedStatus as SupportTicketStatus)) throw new Error("Select a valid ticket status.");

  return prisma.supportTicket.update({
    where: { id },
    data: { status: normalizedStatus },
  });
}
