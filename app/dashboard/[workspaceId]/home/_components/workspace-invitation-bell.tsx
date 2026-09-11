"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Invitation = { id: string; token: string; role: string; expires_at: string; organization: { organization_name: string; organization_id: string }; invitedBy: { full_name: string } };

export function WorkspaceInvitationBell() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/workspace/invitations");
    if (response.ok) setInvitations((await response.json()).invitations || []);
  }
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  async function accept(token: string) {
    const response = await fetch("/api/workspace/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const payload = await response.json();
    setMessage(response.ok ? "Invitation accepted." : payload.error || "Unable to accept invitation.");
    if (response.ok) void load();
  }

  return <div className="relative">
    <button type="button" aria-label="Open invitations" title="Invitations" onClick={() => setOpen((value) => !value)} className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
      <span aria-hidden="true">🔔</span>{invitations.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{invitations.length}</span>}
    </button>
    {open && <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Invitations</h2><button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">Close</button></div>
      {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}
      {invitations.length === 0 ? <p className="py-6 text-sm text-slate-500">No pending invitations.</p> : <div className="mt-3 space-y-3">{invitations.map((invitation) => <div key={invitation.id} className="border-t border-slate-100 pt-3"><p className="text-sm font-semibold text-slate-900">{invitation.organization.organization_name}</p><p className="text-xs text-slate-500">{invitation.invitedBy.full_name} invited you as {invitation.role}.</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => void accept(invitation.token)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Accept</button><Link href={`/dashboard/invitations/${invitation.token}`} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">Open link</Link></div></div>)}</div>}
    </div>}
  </div>;
}
