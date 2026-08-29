import { notFound } from "next/navigation";
import { prisma } from "../../lib/bootstrap/prisma";

const tableConfig: Record<string, { model: any; label: string }> = {
  User: { model: prisma.user, label: "User" },
  BackendAdmin: { model: prisma.backendAdmin, label: "BackendAdmin" },
  Workspace: { model: prisma.workspace, label: "Workspace" },
  Role: { model: prisma.role, label: "Role" },
  Organization: { model: prisma.organization, label: "Organization" },
  OrganizationUser: { model: prisma.organizationUser, label: "OrganizationUser" },
  Subscription: { model: prisma.subscription, label: "Subscription" },
  BackupRecord: { model: prisma.backupRecord, label: "BackupRecord" },
  OtpRequest: { model: prisma.otpRequest, label: "OtpRequest" },
  Tenant: { model: prisma.tenant, label: "Tenant" },
  Vendor: { model: prisma.vendor, label: "Vendor" },
  GstState: { model: prisma.gstState, label: "GstState" },
  GstFetchUsage: { model: prisma.gstFetchUsage, label: "GstFetchUsage" },
  Order: { model: prisma.order, label: "Order" },
  OrderItem: { model: prisma.orderItem, label: "OrderItem" },
  ModuleDefinition: { model: prisma.moduleDefinition, label: "ModuleDefinition" },
  ModuleAccess: { model: prisma.moduleAccess, label: "ModuleAccess" },
  AuditLog: { model: prisma.auditLog, label: "AuditLog" },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export default async function DatabaseTablePage({
  searchParams,
}: {
  searchParams?: Promise<{ table?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const tableName = params.table ?? "User";
  const table = tableConfig[tableName];

  if (!table) {
    notFound();
  }

  const rows = await table.model.findMany({ take: 100 });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="min-h-screen bg-[#f4f7f4] p-6 text-zinc-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4 rounded-3xl border border-[#dce4dc] bg-white p-5 shadow-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Backend</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">{table.label} table</h1>
          </div>
          <a href="/backend" className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-700 hover:text-white">
            Back to backend
          </a>
        </div>

        <div className="overflow-hidden rounded-3xl border border-[#dce4dc] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f7faf7] text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="px-5 py-3 sm:px-6">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-5 py-4 text-zinc-500 sm:px-6" colSpan={columns.length || 1}>No records found.</td>
                  </tr>
                ) : (
                  rows.map((row: Record<string, unknown>, rowIndex: number) => (
                    <tr key={`${table.label}-${rowIndex}`} className="border-t border-zinc-100 hover:bg-[#f9fbf9]">
                      {columns.map((column) => (
                        <td key={`${table.label}-${rowIndex}-${column}`} className="px-5 py-4 align-top text-zinc-600 sm:px-6">
                          {formatValue(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
