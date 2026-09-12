"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

type RoleOption = { role: string; label: string };
type User = { id: string; full_name: string; profile_name: string; email: string };

export default function OrganizationUsersPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const [route, setRoute] = useState<{ workspaceId: string; organizationId: string }>();
  const [members, setMembers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [form, setForm] = useState({ fullName: "", profileName: "", email: "", role: "VIEWER" });
  const [created, setCreated] = useState<User | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { void params.then(setRoute); }, [params]);
  useEffect(() => {
    if (!route) return;
    void fetch(`/api/organizations/${route.organizationId}/members`).then((response) => response.json()).then((payload) => setMembers((payload.members || []).map((member: { workspaceUser: User }) => member.workspaceUser)));
    void fetch(`/api/organizations/${route.organizationId}/role-permissions`).then((response) => response.json()).then((payload) => setRoles((payload.roles || []).filter((role: RoleOption) => role.role !== "OWNER")));
  }, [route]);

  if (!route) return <main className="p-6">Loading users...</main>;

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`/api/organizations/${route!.organizationId}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error || "Unable to create user.");
    setCreated(payload.user);
    setMessage("Standalone workspace user created. Choose a configured role and send the invitation.");
  }

  async function invite() {
    if (!created) return;
    const response = await fetch(`/api/organizations/${route!.organizationId}/invitations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteeUserId: created.id, role: form.role }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error || "Unable to invite user.");
    await navigator.clipboard?.writeText(payload.inviteUrl);
    setMessage(`Invitation created. Link copied: ${payload.inviteUrl}`);
    setCreated(null);
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Organization Settings</p><h1 className="text-2xl font-bold text-slate-900">Users</h1></div><Link href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings`} className="text-sm font-semibold text-emerald-700">Back to Settings</Link></div>{message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}<section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold text-slate-900">Create New User</h2><p className="mt-1 text-sm text-slate-600">Create the standalone account first, then explicitly invite it into this organization.</p><form onSubmit={createUser} className="mt-4 grid gap-3 md:grid-cols-4"><input required placeholder="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="rounded-md border p-2 text-sm" /><input required placeholder="Profile name" value={form.profileName} onChange={(event) => setForm({ ...form, profileName: event.target.value })} className="rounded-md border p-2 text-sm" /><input required type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-md border p-2 text-sm" /><button className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Create User</button></form>{created && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3"><span className="text-sm text-slate-700">Invite {created.full_name} as</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="rounded-md border p-2 text-sm">{roles.map((role) => <option key={role.role} value={role.role}>{role.label}</option>)}</select><button type="button" onClick={() => void invite()} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Send In-App Invite</button></div>}</section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold text-slate-900">Current Members</h2><div className="mt-4 divide-y">{members.map((member) => <div key={member.id} className="flex items-center justify-between py-3"><div><p className="font-semibold text-slate-900">{member.full_name}</p><p className="text-xs text-slate-500">{member.email} · @{member.profile_name}</p></div></div>)}</div></section></main>;
}
