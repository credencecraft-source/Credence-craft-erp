"use client";

import Link from "next/link";
import { useState } from "react";

type BackendUser = {
  id: string;
  name: string;
  email: string;
  profileName?: string | null;
  isPlatformAdmin?: boolean;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  profileName?: string | null;
  isPlatformAdmin?: boolean;
  isActive: boolean;
  createdAt: Date;
  superAdminName?: string | null;
  organizationCount?: number;
};

type OrganizationRow = {
  id: string;
  name: string;
  shortCode: string | null;
  status: string | null;
  createdAt: Date;
  workspace?: { id: string; name: string; slug: string } | null;
  creator?: { id: string; name: string; email: string } | null;
};

type TenantRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  gstNumber: string | null;
  country: string | null;
  createdAt: Date;
  organization?: { id: string; name: string; shortCode: string | null } | null;
};

type TableStatRow = {
  name: string;
  description: string;
  recordCount: number;
};

type ModuleKey = "organizations" | "backend-admin" | "workspace-user" | "table-module";

export function BackendDashboardClient({
  user,
  users,
  workspaceUsers,
  organizations,
  tenants,
  tableStats,
}: {
  user: BackendUser;
  users: UserRow[];
  workspaceUsers: UserRow[];
  organizations: OrganizationRow[];
  tenants: TenantRow[];
  tableStats: TableStatRow[];
}) {
  const [activeModule, setActiveModule] = useState<ModuleKey>("organizations");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [statusTone, setStatusTone] = useState<"success" | "error">("success");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const backendAdmins = users;

  const handleUserStatusToggle = async (userId: string, isActive: boolean) => {
    const action = isActive ? "deactivate" : "activate";
    setBusyUserId(userId);
    try {
      const response = await fetch(`/api/backend/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update user status.");
      }

      setStatusTone("success");
      setStatusMessage(action === "deactivate" ? "User marked inactive." : "User activated successfully.");
      window.location.reload();
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to update user status.");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleUserDelete = async (userId: string, label: string) => {
    const confirmed = window.confirm(`Delete ${label}? This action will remove the related records for this user.`);
    if (!confirmed) return;

    setBusyUserId(userId);
    try {
      const response = await fetch(`/api/backend/users/${userId}`, {
        method: "DELETE",
        headers: { "x-delete-confirm": "true" },
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete user.");
      }

      setStatusTone("success");
      setStatusMessage(payload.message || `${label} deleted successfully.`);
      window.location.reload();
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to delete user.");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleOrganizationDelete = async (organizationId: string, name: string) => {
    const confirmed = window.confirm(`Delete organization ${name}? This will remove all related records for this organization.`);
    if (!confirmed) return;

    setBusyUserId(organizationId);
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: "DELETE",
        headers: { "x-delete-confirm": "true" },
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete organization.");
      }

      setStatusTone("success");
      setStatusMessage(payload.message || `${name} deleted successfully.`);
      window.location.reload();
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to delete organization.");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] text-zinc-950">
      <div className="flex min-h-screen">
        <aside className="w-72 bg-[#10251d] p-4 text-white">
          <div className="mb-8 flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="grid size-10 place-items-center rounded-xl bg-white/10 font-bold">CC</div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/80">Backend</p>
              <p className="text-lg font-semibold">Admin Panel</p>
            </div>
          </div>

          <nav className="space-y-2">
            <button
              type="button"
              onClick={() => setActiveModule("organizations")}
              className={`block w-full rounded-xl px-3 py-2.5 text-left transition ${activeModule === "organizations" ? "bg-emerald-700/30 font-semibold text-white" : "text-emerald-100/70 hover:bg-white/5"}`}
            >
              Organizations
            </button>
            <button
              type="button"
              onClick={() => setActiveModule("workspace-user")}
              className={`block w-full rounded-xl px-3 py-2.5 text-left transition ${activeModule === "workspace-user" ? "bg-emerald-700/30 font-semibold text-white" : "text-emerald-100/70 hover:bg-white/5"}`}
            >
              Workspace user
            </button>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">
              <button
                type="button"
                onClick={() => setActiveModule("backend-admin")}
                className={`block w-full rounded-xl px-3 py-2.5 text-left transition ${activeModule === "backend-admin" ? "bg-emerald-700/30 font-semibold text-white" : "text-emerald-100/70 hover:bg-white/5"}`}
              >
                Backend admin
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule("table-module")}
              className={`block w-full rounded-xl px-3 py-2.5 text-left transition ${activeModule === "table-module" ? "bg-emerald-700/30 font-semibold text-white" : "text-emerald-100/70 hover:bg-white/5"}`}
            >
              Table module
            </button>
          </nav>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">Logged in</p>
            <p className="mt-2 font-semibold">{user.name}</p>
            <p className="text-sm text-emerald-100/75">{user.email}</p>
          </div>
        </aside>

        <main className="flex-1 p-6">
          <header className="mb-6 flex items-center justify-between rounded-3xl border border-[#dce4dc] bg-white p-5 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Backend</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Module list</h1>
            </div>
            <form action="/api/auth/backend-logout" method="POST">
              <button type="submit" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-600 hover:text-white">
                Logout
              </button>
            </form>
          </header>

          {statusMessage ? (
            <div className={`mb-6 rounded-xl border px-3 py-2 text-sm ${statusTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
              {statusMessage}
            </div>
          ) : null}

          <div className="space-y-6">
            {activeModule === "backend-admin" && (
              <TablePanel
                title="Backend admin"
                description="Live backend administrators"
                columns={["Name", "Profile", "Email", "Role", "Created", "Status"]}
                rows={backendAdmins.length === 0 ? [["No backend admin records found.", "", "", "", "", ""]] : backendAdmins.map((item) => [item.name, item.profileName || "—", item.email, "Backend admin", new Date(item.createdAt).toLocaleDateString(), item.isActive === false ? "Inactive" : "Active"]) }
                colspan={6}
              />
            )}

            {activeModule === "workspace-user" && (
              <TablePanel
                title="Workspace user"
                description="Live workspace users"
                columns={["Name", "Profile", "Email", "Role", "Organizations", "Created", "Status", "Action"]}
                rows={workspaceUsers.length === 0 ? [["No workspace user records found.", "", "", "", "", "", "", ""]] : workspaceUsers.map((item) => [item.name, item.profileName || "—", item.email, "Workspace user", String(item.organizationCount ?? 0), new Date(item.createdAt).toLocaleDateString(), item.isActive === false ? "Inactive" : "Active", ""]) }
                rowIds={workspaceUsers.map((item) => item.id)}
                statusColumnIndex={6}
                colspan={8}
                showActions={true}
                onToggleStatus={(userId, isActive) => handleUserStatusToggle(userId, isActive)}
                onDelete={(userId, label) => handleUserDelete(userId, label)}
                busyUserId={busyUserId}
              />
            )}

            {activeModule === "organizations" && (
              <TablePanel
                title="Organizations"
                description="All registered organizations"
                columns={["Name", "Short code", "Status", "Workspace", "Created by", "Action"]}
                rows={organizations.length === 0 ? [["No organization records found.", "", "", "", "", ""]] : organizations.map((item) => [item.name, item.shortCode || "—", item.status || "Active", item.workspace?.name || "—", item.creator?.name || "—", ""])}
                rowIds={organizations.map((item) => item.id)}
                colspan={6}
                showActions={true}
                onDelete={(organizationId, label) => {
                  const item = organizations.find((organization) => organization.id === organizationId);
                  if (item) {
                    handleOrganizationDelete(organizationId, item.name);
                  }
                }}
                busyUserId={busyUserId}
              />
            )}

            {activeModule === "table-module" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#dfe8df] bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Database overview</p>
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-zinc-500">Total records</p>
                      <p className="text-2xl font-semibold text-[#17372a]">{tableStats.reduce((sum, item) => sum + item.recordCount, 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-500">Tables</p>
                      <p className="text-2xl font-semibold text-[#17372a]">{tableStats.length}</p>
                    </div>
                  </div>
                </div>

                <TablePanel
                  title="Table module"
                  description="Complete table inventory with record counts across the application database"
                  columns={["Table name", "Description", "Records"]}
                  rows={tableStats.length === 0 ? [["No table data found.", "", "0"]] : tableStats.map((item) => [item.name, item.description, String(item.recordCount)])}
                  colspan={3}
                  rowLinks={tableStats.map((item) => ({
                    rowIndex: tableStats.indexOf(item),
                    href: `/backend/table?table=${encodeURIComponent(item.name)}`,
                  }))}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function TablePanel({ title, description, columns, rows, rowIds, statusColumnIndex, colspan, showActions = false, onToggleStatus, onDelete, busyUserId, rowLinks }: { title: string; description: string; columns: string[]; rows: Array<Array<string>>; rowIds?: string[]; statusColumnIndex?: number; colspan: number; showActions?: boolean; onToggleStatus?: (userId: string, isActive: boolean) => void; onDelete?: (userId: string, label: string) => void; busyUserId?: string | null; rowLinks?: Array<{ rowIndex: number; href: string }>; }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-[#dce4dc] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#e7ece7] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[#17372a]">{title}</h2>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
      </div>

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
            {rows.map((row, rowIndex) => {
              const rowLink = rowLinks?.find((link) => link.rowIndex === rowIndex);

              return (
                <tr key={`${title}-${rowIndex}`} className="border-t border-zinc-100 hover:bg-[#f9fbf9]">
                  {row.map((cell, cellIndex) => {
                    const isClickableCountCell = Boolean(rowLink) && cellIndex === row.length - 1;

                    return (
                      <td key={`${title}-${rowIndex}-${cellIndex}`} className="px-5 py-4 text-zinc-600 sm:px-6">
                        {isClickableCountCell && rowLink ? (
                          <Link
                            href={rowLink.href}
                            className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-600 hover:text-white"
                          >
                            {cell}
                          </Link>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                  {showActions && (
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-2">
                      {typeof statusColumnIndex === "number" && row[statusColumnIndex] && (
                        <button
                          type="button"
                          disabled={busyUserId !== null && busyUserId !== (rowIds?.[rowIndex] ?? null)}
                          onClick={() => {
                            if (onToggleStatus && rowIds?.[rowIndex]) {
                              const isActive = row[statusColumnIndex] !== "Inactive";
                              onToggleStatus(rowIds[rowIndex], isActive);
                            }
                          }}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {row[statusColumnIndex] === "Inactive" ? "Activate" : "Inactive"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyUserId !== null && busyUserId !== (rowIds?.[rowIndex] ?? null)}
                        onClick={() => {
                          if (onDelete && rowIds?.[rowIndex]) {
                            onDelete(rowIds[rowIndex], title);
                          }
                        }}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyUserId === rowIds?.[rowIndex] ? "Working..." : "Delete"}
                      </button>
                    </div>
                  </td>
                )}
                  {row.length < colspan && Array.from({ length: colspan - row.length }).map((_, placeholderIndex) => (
                    <td key={`${title}-${rowIndex}-empty-${placeholderIndex}`} className="px-5 py-4 text-zinc-600 sm:px-6">&nbsp;</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
