import Badge from "@/components/ui/Badge";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";
import { listOrganizationClients } from "@/lib/services/platform/client-service";

export default async function PlatformClientsPage() {
  await ensurePlatformDefaults();
  const clients = await listOrganizationClients();

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-600">
            Every registered organization, its current plan, and its assigned database.
          </p>
        </div>

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Account owner</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Database</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((client) => (
              <tr key={client.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{client.organization_name}</td>
                <td className="px-4 py-3 text-slate-600">{client.workspaceUser.email}</td>
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
                  <Badge className={client.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                    {client.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(client.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}

            {clients.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                  No organizations yet.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Section>
    </Page>
  );
}
