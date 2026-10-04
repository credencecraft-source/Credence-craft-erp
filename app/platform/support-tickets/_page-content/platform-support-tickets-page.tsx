import PlatformSupportTicketsWorkspace from "./platform-support-tickets-workspace";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  getSupportTicket,
  listSupportTicketOrganizations,
  listSupportTickets,
} from "@/lib/services/organizations/support-ticket-service";

export default async function PlatformSupportTicketsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ticketId?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const query = (await searchParams) ?? {};
  const [ticketRows, organizations, selected] = await Promise.all([
    listSupportTickets(),
    listSupportTicketOrganizations(),
    query.ticketId ? getSupportTicket(query.ticketId) : Promise.resolve(null),
  ]);
  const tickets = ticketRows.map((ticket) => ({
    ...ticket,
    created_at: ticket.created_at.toISOString(),
    updated_at: ticket.updated_at.toISOString(),
  }));
  const selectedTicket = selected ? {
    ...selected,
    created_at: selected.created_at.toISOString(),
    updated_at: selected.updated_at.toISOString(),
    messages: selected.messages.map((message) => ({
      id: message.id,
      body: message.body,
      senderType: message.sender_type,
      senderName: message.workspaceUser?.full_name || message.platformAdmin?.full_name || "Support",
      createdAt: message.created_at.toISOString(),
    })),
  } : null;

  return <PlatformSupportTicketsWorkspace tickets={tickets} organizations={organizations} selectedTicket={selectedTicket} />;
}
