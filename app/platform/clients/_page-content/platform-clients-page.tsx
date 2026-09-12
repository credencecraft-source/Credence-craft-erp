import { redirect } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";
import { listOrganizationClientsPage } from "@/lib/services/platform/client-service";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { deleteOrganizationFromPlatform } from "@/lib/services/organizations/organization-service";

export default async function PlatformClientsPage({ searchParams }: { searchParams?: Promise<{ cursor?: string; error?: string }> }) {
  await ensurePlatformDefaults();
  const query = (await searchParams) ?? {};
  const page = await listOrganizationClientsPage({ cursor: query.cursor });
  const clients = page.clients;

  async function deleteClient(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await deleteOrganizationFromPlatform(String(formData.get("organizationId")));
    } catch (error) {
      redirect(`/platform/organisations?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete organization.")}`);
    }
    redirect("/platform/organisations");
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Organisations</h1>
          <p className="text-sm text-slate-600">
            {page.total} registered organization{page.total === 1 ? "" : "s"}, with plans, databases, and approval status.
          </p>
        </div>
        {query.error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{query.error}</p>}

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Account owner</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Database</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((client) => (
              <tr key={client.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/platform/organisations/${client.id}`} className="text-emerald-700 hover:text-emerald-800 hover:underline">
                    {client.organization_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{client.memberships[0]?.workspaceUser.email ?? "Unassigned"}</td>
                <td className="px-4 py-3">
                  {client.plan ? (
                    <Badge>{client.plan.plan_name}</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {client.databaseConnection
                    ? `${client.databaseConnection.connection_name} (${client.databaseConnection.provider})`
                    : "Unassigned"}
                </td>
                <td className="px-4 py-3">
                  <Badge>{client.approval_status.replaceAll("_", " ")}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(client.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <form action={deleteClient}>
                    <input type="hidden" name="organizationId" value={client.id} />
                    <button type="submit" className="text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
                  </form>
                </td>
              </tr>
            ))}

            {clients.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={7}>
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
