import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getSupportTicketForOrganization,
  listSupportTicketsForOrganization,
} from "@/lib/services/organizations/support-ticket-service";
import OrganizationSupportTicketsPage from "./_page-content/organization-support-tickets-page";

export default async function OrganizationSupportTicketsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams?: Promise<{ ticketId?: string }>;
}) {
  const user = await requireSessionUser();
  const { workspaceId, organizationId } = await params;
  if (user.workspace_id !== workspaceId) notFound();

  const query = (await searchParams) ?? {};
  const tickets = await listSupportTicketsForOrganization(organizationId, user.id);
  const selected = query.ticketId
    ? await getSupportTicketForOrganization(organizationId, query.ticketId, user.id)
    : null;

  return (
    <OrganizationSupportTicketsPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      tickets={tickets}
      selectedTicket={selected ? {
        id: selected.id,
        ticket_number: selected.ticket_number,
        subject: selected.subject,
        description: selected.description,
        priority: selected.priority,
        status: selected.status,
        request_type: selected.request_type,
        created_at: selected.created_at.toISOString(),
        submittedBy: selected.submittedBy.full_name,
        messages: selected.messages.map((message) => ({
          id: message.id,
          body: message.body,
          senderType: message.sender_type,
          senderName: message.workspaceUser?.full_name || message.platformAdmin?.full_name || "Support",
          createdAt: message.created_at.toISOString(),
        })),
      } : null}
    />
  );
}
