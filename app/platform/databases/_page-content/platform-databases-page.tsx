import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";
import { listDatabaseConnections } from "@/lib/services/platform/database-connection-service";

function maskConnectionString(value: string | null) {
  if (!value) {
    return "-";
  }

  if (value.length <= 8) {
    return "••••••••";
  }

  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export default async function PlatformDatabasesPage() {
  await ensurePlatformDefaults();
  const connections = await listDatabaseConnections();

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="erp-eyebrow">Platform</p>
            <h1 className="text-2xl font-bold text-slate-900">Databases</h1>
            <p className="text-sm text-slate-600">
              Every PostgreSQL-compatible database connection available for organization assignment.
            </p>
          </div>
          <Link href="/platform/databases/create">
            <Button>Create database</Button>
          </Link>
        </div>

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Connection name</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Host</th>
              <th className="px-4 py-3">Database</th>
              <th className="px-4 py-3">Connection string</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Default</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {connections.map((connection) => (
              <tr key={connection.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{connection.connection_name}</td>
                <td className="px-4 py-3 text-slate-600">{connection.provider}</td>
                <td className="px-4 py-3 text-slate-600">
                  {connection.host ? `${connection.host}${connection.port ? `:${connection.port}` : ""}` : "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">{connection.database_name || "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {maskConnectionString(connection.connection_string)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={connection.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                    {connection.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">{connection.is_default ? "Yes" : "-"}</td>
              </tr>
            ))}

            {connections.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={7}>
                  No database connections yet.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Section>
    </Page>
  );
}
