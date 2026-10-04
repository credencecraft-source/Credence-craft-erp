import { redirect } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { BadgePercent } from "lucide-react";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";
import { listOrganizationClientsPage } from "@/lib/services/platform/client-service";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { updateOrganizationApprovalStatus } from "@/lib/services/organizations/organization-service";

export default async function PlatformClientsPage({ searchParams }: { searchParams?: Promise<{ cursor?: string; error?: string; success?: string }> }) {
  await ensurePlatformDefaults();
  const query = (await searchParams) ?? {};
  const page = await listOrganizationClientsPage({ cursor: query.cursor });
  const clients = page.clients;

  async function approveClient(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await updateOrganizationApprovalStatus(String(formData.get("organizationId") || ""), "APPROVED");
    } catch (error) {
      redirect(`/platform/organisations?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to approve organisation.")}`);
    }
    redirect("/platform/organisations");
  }

  return (
    <Page className="max-w-none px-1 py-1 sm:px-2 lg:px-3">
      <Section className="space-y-3">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Organisations</h1>
          <p className="text-sm text-slate-600">
            {page.total} registered organization{page.total === 1 ? "" : "s"}, with account owners, contact details, and approval status.
          </p>
        </div>
        {query.error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{query.error}</p>}
        {query.success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{query.success}</p>}

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-2">Organization</th>
              <th className="px-2 py-2">Organisation number</th>
              <th className="px-2 py-2">Account owner</th>
              <th className="px-2 py-2">Mobile number</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Created</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((client) => (
              <tr key={client.id}>
                <td className="px-2 py-2 font-medium text-slate-900">
                  <Link href={`/platform/organisations/${client.id}`} className="text-emerald-700 hover:text-emerald-800 hover:underline">
                    {client.organization_name}
                  </Link>
                  {client.hasCustomSegmentPricing && (
                    <span role="img" aria-label="Custom price applies" title="Custom price applies to one or more segments" className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      <BadgePercent aria-hidden="true" className="h-3 w-3" /> Custom Price
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums text-slate-600">
                  {client.organization_number}
                </td>
                <td className="px-2 py-2 text-slate-600">{client.memberships[0]?.workspaceUser.email ?? "Unassigned"}</td>
                <td className="px-2 py-2 text-slate-600">{client.mobile_number || "Not provided"}</td>
                <td className="px-2 py-2">
                  <Badge>{client.approval_status.replaceAll("_", " ")}</Badge>
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                  {new Date(client.created_at).toLocaleDateString()}
                </td>
                <td className="px-2 py-2">
                  <form action={approveClient}>
                    <input type="hidden" name="organizationId" value={client.id} />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={client.approval_status === "APPROVED" || !client.platformVersion?.is_active}
                    >
                      Approve
                    </Button>
                  </form>
                </td>
              </tr>
            ))}

            {clients.length === 0 && (
              <tr>
                <td className="px-2 py-4 text-center text-sm text-slate-500" colSpan={7}>
                  No organizations yet.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Section>
      {page.nextCursor && (
        <a href={`/platform/organisations?cursor=${encodeURIComponent(page.nextCursor)}`} className="text-sm font-semibold text-emerald-700">
          Next page
        </a>
      )}
    </Page>
  );
}
