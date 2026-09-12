"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Role = { role: string; label: string; permissions: string[]; isSystem?: boolean };

export default function OrganizationRolesPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const [route, setRoute] = useState<{ workspaceId: string; organizationId: string }>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void params.then(setRoute); }, [params]);
  useEffect(() => {
    if (!route) return;
    void fetch(`/api/organizations/${route.organizationId}/role-permissions`).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) return setMessage(payload.error || "Unable to load roles.");
      setRoles(payload.roles || []);
    });
  }, [route]);

  if (!route) return <main className="p-6">Loading roles...</main>;

  async function createRole() {
    const response = await fetch(`/api/organizations/${route!.organizationId}/role-permissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newRoleLabel, permissions: [] }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error || "Unable to create role.");
    setNewRoleLabel("");
    window.location.href = `/dashboard/${route!.workspaceId}/organizations/${route!.organizationId}/settings/roles/${payload.role.role}`;
  }

  async function deleteRole(role: Role) {
    if (!window.confirm(`Delete the ${role.label} role?`)) return;
    const response = await fetch(`/api/organizations/${route!.organizationId}/role-permissions/${role.role}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error || "Unable to delete role.");
    setRoles((current) => current.filter((item) => item.role !== role.role));
    setMessage(`${role.label} deleted.`);
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Organization Settings</p><h1 className="text-2xl font-bold text-slate-900">Roles & Permissions</h1><p className="mt-1 text-sm text-slate-600">Open a role to configure its name and module access.</p></div><Link href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings`} className="text-sm font-semibold text-emerald-700">Back to Settings</Link></div>{message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}<section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5"><h2 className="font-bold text-slate-900">Create role</h2><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input value={newRoleLabel} onChange={(event) => setNewRoleLabel(event.target.value)} placeholder="Role name, e.g. Production Manager" className="rounded-md border border-slate-300 bg-white p-2 text-sm sm:w-80" /><button type="button" onClick={() => void createRole()} disabled={!newRoleLabel.trim()} className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Create role</button></div><p className="mt-2 text-xs text-slate-500">You will configure module access after opening the new role.</p></section><section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500"><span>Role</span><span>Access</span><span>Actions</span></div><div className="divide-y divide-slate-100">{roles.map((role) => <div key={role.role} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4"><Link href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings/roles/${role.role}`} className="min-w-0"><span className="block truncate font-semibold text-slate-900 hover:text-emerald-700">{role.label}</span><span className="block text-xs text-slate-500">{role.isSystem ? "Built-in role" : "Custom role"}</span></Link><span className="text-sm text-slate-500">{role.role === "OWNER" ? "All modules" : `${role.permissions.length} configured`}</span>{role.isSystem ? <Link href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings/roles/${role.role}`} className="text-sm font-semibold text-emerald-700">Open</Link> : <div className="flex items-center gap-3"><Link href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings/roles/${role.role}`} className="text-sm font-semibold text-emerald-700">Open</Link><button type="button" onClick={() => void deleteRole(role)} className="text-sm font-semibold text-red-700">Delete</button></div>}</div>)}</div></section></main>;
}
