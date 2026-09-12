"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Role = { role: string; label: string; permissions: string[]; isSystem?: boolean };
const permissionLabels: Record<string, string> = { ORGANIZATION_SETTINGS: "Organization settings", MANAGE_USERS: "Manage users", MANAGE_ROLES: "Manage roles", VIEW_REPORTS: "View reports", MANAGE_MASTER_DATA: "Manage master data", CREATE_ORDERS: "Create orders", APPROVE_ORDERS: "Approve orders", VIEW_ORDERS: "View orders" };

export default function OrganizationRoleDetailPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string; roleKey: string }> }) {
  const [route, setRoute] = useState<{ workspaceId: string; organizationId: string; roleKey: string }>();
  const [role, setRole] = useState<Role>();
  const [message, setMessage] = useState("");
  const permissions = Object.keys(permissionLabels);

  useEffect(() => { void params.then(setRoute); }, [params]);
  useEffect(() => {
    if (!route) return;
    void fetch(`/api/organizations/${route.organizationId}/role-permissions/${route.roleKey}`).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) return setMessage(payload.error || "Unable to load role.");
      setRole(payload.role);
    });
  }, [route]);

  if (!route || !role) return <main className="p-6">{message || "Loading role..."}</main>;
  const loadedRoute = route;
  const loadedRole = role;

  function togglePermission(permission: string) {
    setRole((current) => current ? { ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((value) => value !== permission) : [...current.permissions, permission] } : current);
  }

  async function save() {
    const response = await fetch(`/api/organizations/${loadedRoute.organizationId}/role-permissions/${loadedRoute.roleKey}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: loadedRole.label, permissions: loadedRole.permissions }) });
    const payload = await response.json();
    setMessage(response.ok ? "Role saved." : payload.error || "Unable to save role.");
  }

  async function remove() {
    if (!window.confirm(`Delete the ${loadedRole.label} role?`)) return;
    const response = await fetch(`/api/organizations/${loadedRoute.organizationId}/role-permissions/${loadedRoute.roleKey}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error || "Unable to delete role.");
    window.location.href = `/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles`;
  }

  return <main className="mx-auto max-w-6xl space-y-5 p-6"><Link href={`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles`} className="text-sm font-semibold text-emerald-700">Back to roles</Link><section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 p-4"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</span><input value={loadedRole.label} disabled={loadedRole.isSystem} onChange={(event) => setRole((current) => current ? { ...current, label: event.target.value } : current)} className="min-w-56 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:bg-slate-100" />{loadedRole.role !== "OWNER" && <button type="button" onClick={() => void save()} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save</button>}{!loadedRole.isSystem && <button type="button" onClick={() => void remove()} className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Delete</button>}</div>{message && <p className="border-b border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}<div className="p-5"><div className="flex items-center justify-between gap-3"><div><h1 className="text-lg font-bold text-slate-900">Module access</h1><p className="text-sm text-slate-500">Select the permissions for this role.</p></div><span className="text-xs text-slate-500">{loadedRole.role === "OWNER" ? "Full access" : `${loadedRole.permissions.length} selected`}</span></div><div className="mt-4 flex flex-wrap gap-2">{permissions.map((permission) => <label key={permission} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"><input type="checkbox" disabled={loadedRole.role === "OWNER"} checked={loadedRole.permissions.includes(permission)} onChange={() => togglePermission(permission)} />{permissionLabels[permission]}</label>)}</div></div></section></main>;
}
