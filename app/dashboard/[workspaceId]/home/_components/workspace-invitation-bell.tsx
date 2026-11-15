"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bell } from "lucide-react";

export function WorkspaceInvitationBell() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [pendingCount, setPendingCount] = useState(0);

  async function load() {
    try {
      const response = await fetch("/api/workspace/notification-counts", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json();
      setPendingCount(Number(result.invitations || 0) + Number(result.orderShares || 0));
    } catch {
      setPendingCount(0);
    }
  }
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  return <Link href={`/dashboard/${workspaceId}/notifications`} aria-label="Open notifications" title="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
      <Bell className="h-4 w-4" aria-hidden="true" />{pendingCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{pendingCount}</span>}
    </Link>;
}
