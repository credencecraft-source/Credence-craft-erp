import Link from "next/link";
import { notFound } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { listAuditEvents } from "@/lib/services/organizations/audit-event-service";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDetails(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "No additional information";
  }

  const entries = Object.entries(details as Record<string, unknown>);
  if (entries.length === 0) return "No additional information";

  return entries
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" | ");
}

export default async function OrganizationAuditHistoryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  const auditEvents = await listAuditEvents(organization.id);
  const settingsPath = `/dashboard/${workspaceId}/organizations/${organizationId}/settings`;

  return (
    <Page>
      <Section className="space-y-6">
        <div>
          <h1 className="erp-page-heading">Audit History</h1>
          <p className="erp-page-subheading">
            A chronological ERP-grade record of activity in {organization.organization_name}.
          </p>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Application activity</h2>
              <p className="mt-1 text-xs text-slate-500">Showing the latest {auditEvents.length} events.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {auditEvents.length.toLocaleString("en-IN")} events
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-semibold">User ID</th>
                  <th className="px-5 py-3 font-semibold">Date and time</th>
                  <th className="px-5 py-3 font-semibold">Module</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Information</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditEvents.map((event) => (
                  <tr key={event.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{event.user?.full_name ?? "System"}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{event.user_id ?? "system"}</p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {formatDateTime(event.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                        {event.module}
                      </span>
                      {event.entity_type ? <p className="mt-2 text-xs text-slate-500">{event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ""}</p> : null}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{event.action}</td>
                    <td className="max-w-xl px-5 py-4 text-xs leading-5 text-slate-600">{formatDetails(event.details)}</td>
                  </tr>
                ))}
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                      No audit activity has been recorded for this organization yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
