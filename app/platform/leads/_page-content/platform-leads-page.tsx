import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listPlatformLeads } from "@/lib/services/platform/platform-lead-service";
import PlatformLeadsWorkspace from "./platform-leads-workspace";

export default async function PlatformLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ leadId?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const query = (await searchParams) ?? {};
  const leadRows = await listPlatformLeads();
  const leads = leadRows.map((lead) => ({
    ...lead,
    created_at: lead.created_at.toISOString(),
    updated_at: lead.updated_at.toISOString(),
  }));
  const selectedLead = leads.find((lead) => lead.id === query.leadId) ?? null;

  return <PlatformLeadsWorkspace leads={leads} selectedLead={selectedLead} />;
}
