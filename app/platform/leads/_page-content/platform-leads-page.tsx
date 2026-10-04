import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  listPlatformLeadAppLogins,
  listPlatformLeads,
} from "@/lib/services/platform/platform-lead-service";
import { listPlatformLeadSupportTickets } from "@/lib/services/organizations/support-ticket-service";
import PlatformLeadsWorkspace from "./platform-leads-workspace";

export default async function PlatformLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ leadId?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const query = (await searchParams) ?? {};
  const [leadRows, appLoginRows] = await Promise.all([
    listPlatformLeads(),
    listPlatformLeadAppLogins(),
  ]);
  const leads = leadRows.map((lead) => ({
    ...lead,
    created_at: lead.created_at.toISOString(),
    updated_at: lead.updated_at.toISOString(),
    recordType: "THIRD_PARTY" as const,
  }));
  const selectedLead = leads.find((lead) => lead.id === query.leadId) ?? null;
  const leadTicketRows = selectedLead
    ? await listPlatformLeadSupportTickets(selectedLead.id)
    : [];
  const selectedLeadTickets = leadTicketRows.map((ticket) => ({
    ...ticket,
    created_at: ticket.created_at.toISOString(),
    updated_at: ticket.updated_at.toISOString(),
  }));
  const appLogins = appLoginRows.map((user) => ({
    ...user,
    last_login_at: user.last_login_at?.toISOString() ?? "",
  }));

  return (
    <PlatformLeadsWorkspace
      leads={leads}
      appLogins={appLogins}
      selectedLead={selectedLead}
      selectedLeadTickets={selectedLeadTickets}
    />
  );
}
