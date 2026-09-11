"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Invitation = { id: string; token: string; role: string; expires_at: string; organization: { organization_name: string; organization_id: string }; invitedBy: { full_name: string } };
type OrderShare = { id: string; sourceOrder: { orderNo: string; brand?: string | null; orderQty?: number | null }; sourceOrganization: { organization_name: string }; };

export function WorkspaceInvitationBell() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [shares, setShares] = useState<OrderShare[]>([]);

  async function load() {
    const response = await fetch("/api/workspace/invitations");
    if (response.ok) setInvitations((await response.json()).invitations || []);
    const sharesResponse = await fetch("/api/workspace/order-shares", { cache: "no-store" });
    if (sharesResponse.ok) setShares((await sharesResponse.json()).shares || []);
  }
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  return <Link href={`/dashboard/${workspaceId}/notifications`} aria-label="Open notifications" title="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
      <span aria-hidden="true">🔔</span>{invitations.length + shares.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{invitations.length + shares.length}</span>}
    </Link>;
}
