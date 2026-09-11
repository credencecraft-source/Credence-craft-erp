"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function InvitationLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [message, setMessage] = useState("Review this invitation and accept it to join the organization.");
  async function accept() { const response = await fetch("/api/workspace/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); const payload = await response.json(); setMessage(response.ok ? "Invitation accepted. Return to your workspace home to open the organization." : payload.error || "Unable to accept invitation."); }
  return <main className="mx-auto max-w-lg p-6"><div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold text-slate-900">Organization invitation</h1><p className="mt-3 text-sm text-slate-600">{message}</p><button type="button" onClick={() => void accept()} className="mt-5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Accept invitation</button></div></main>;
}
