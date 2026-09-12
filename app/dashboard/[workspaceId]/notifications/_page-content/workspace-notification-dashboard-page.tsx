"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Invitation = {
  id: string;
  token: string;
  role: string;
  organization: { organization_name: string; organization_id: string };
  invitedBy: { full_name: string };
};

type OrderShare = {
  id: string;
  sourceOrder: { orderNo: string; brand?: string | null; orderQty?: number | null };
  sourceOrganization: { organization_name: string };
};

type Organization = { organization_id: string; organization_name: string };
type Ticket = { id: string; ticket_number: string; subject: string; status: string; created_at: string };
type NotificationType = "orders" | "invitations" | "tickets";

export default function WorkspaceNotificationDashboardPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [activeType, setActiveType] = useState<NotificationType>("orders");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [shares, setShares] = useState<OrderShare[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [destinationByShare, setDestinationByShare] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadNotifications() {
    setLoading(true);
    const [invitationResponse, organizationResponse, shareResponse, ticketResponse] = await Promise.all([
      fetch("/api/workspace/invitations", { cache: "no-store" }),
      fetch("/api/organizations", { cache: "no-store" }),
      fetch("/api/workspace/order-shares", { cache: "no-store" }),
      fetch("/api/workspace/support-tickets", { cache: "no-store" }),
    ]);

    if (invitationResponse.ok) setInvitations((await invitationResponse.json()).invitations || []);
    if (organizationResponse.ok) setOrganizations((await organizationResponse.json()).organizations || []);
    if (shareResponse.ok) setShares((await shareResponse.json()).shares || []);
    if (ticketResponse.ok) setTickets((await ticketResponse.json()).tickets || []);
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadNotifications();
    });
  }, []);

  async function acceptInvitation(token: string) {
    const response = await fetch("/api/workspace/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Invitation accepted." : payload.error || "Unable to accept invitation.");
    if (response.ok) void loadNotifications();
  }

  async function processShare(shareId: string, action: "accept" | "reject") {
    const destinationOrganizationId = destinationByShare[shareId];
    if (action === "accept" && !destinationOrganizationId) {
      setMessage("Select the organization that should receive the order.");
      return;
    }

    const response = await fetch("/api/workspace/order-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId, action, destinationOrganizationId }),
    });
    const payload = await response.json();
    setMessage(response.ok ? (action === "accept" ? "Order accepted and created." : "Order request rejected.") : payload.error || "Unable to process order request.");
    if (response.ok) void loadNotifications();
  }

  const total = shares.length + invitations.length + tickets.length;
  const isOrders = activeType === "orders";
  const isInvitations = activeType === "invitations";

  return (
    <main className="min-h-screen bg-slate-50/70">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-6">
          <Link href={`/dashboard/${workspaceId}/home`} className="mb-8 flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-emerald-700">
            <span aria-hidden="true">←</span> Workspace home
          </Link>
          <div className="mb-6 px-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Workspace center</p>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Notifications</h1>
            <p className="mt-1 text-xs leading-5 text-slate-500">Review requests, invitations, and shared work.</p>
          </div>
          <nav aria-label="Notification types" className="space-y-1">
            <button type="button" onClick={() => setActiveType("orders")} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${isOrders ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}>
              <span className="flex items-center gap-3"><span aria-hidden="true">↗</span> Orders</span>
              {shares.length > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">{shares.length}</span>}
            </button>
            <button type="button" onClick={() => setActiveType("invitations")} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${isInvitations ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}>
              <span className="flex items-center gap-3"><span aria-hidden="true">✉</span> Invitations</span>
              {invitations.length > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">{invitations.length}</span>}
            </button>
            <button type="button" onClick={() => setActiveType("tickets")} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${activeType === "tickets" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><span className="flex items-center gap-3"><span aria-hidden="true">◷</span> Tickets</span>{tickets.length > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">{tickets.length}</span>}</button>
          </nav>
          <div className="mt-8 border-t border-slate-100 px-3 pt-5 text-xs text-slate-400">{total} pending request{total === 1 ? "" : "s"}</div>
        </aside>

        <section className="min-w-0 flex-1 px-5 py-6 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Request queue</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{isOrders ? "Order requests" : isInvitations ? "Organization invitations" : "Support tickets"}</h2>
            </div>
            <span className="text-xs text-slate-500">{isOrders ? shares.length : isInvitations ? invitations.length : tickets.length} open</span>
          </div>

          {message && <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{message}</div>}
          {loading ? <p className="py-16 text-center text-sm text-slate-500">Loading requests...</p> : isOrders ? (
            shares.length === 0 ? <EmptyState label="No order requests" detail="Shared orders will appear here when another organization sends one to your workspace." /> :
              <div className="mt-6 space-y-3">{shares.map((share) => <article key={share.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-bold text-slate-900">Order {share.sourceOrder.orderNo}</p><p className="mt-1 text-sm text-slate-500">Shared by {share.sourceOrganization.organization_name}{share.sourceOrder.brand ? ` · ${share.sourceOrder.brand}` : ""}</p>{share.sourceOrder.orderQty != null && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Quantity <span className="ml-1 text-slate-700">{share.sourceOrder.orderQty.toLocaleString()}</span></p>}</div><div className="w-full max-w-sm"><label className="text-xs font-semibold text-slate-600" htmlFor={`destination-${share.id}`}>Create copy in</label><select id={`destination-${share.id}`} value={destinationByShare[share.id] || ""} onChange={(event) => setDestinationByShare((current) => ({ ...current, [share.id]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><option value="">Select organization</option>{organizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.organization_name}</option>)}</select><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => void processShare(share.id, "reject")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Reject</button><button type="button" onClick={() => void processShare(share.id, "accept")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Accept and create</button></div></div></div></article>)}</div>
          ) : isInvitations ? invitations.length === 0 ? <EmptyState label="No invitations" detail="Organization invitations will appear here when someone adds you to their team." /> :
            <div className="mt-6 space-y-3">{invitations.map((invitation) => <article key={invitation.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-900">Join {invitation.organization.organization_name}</p><p className="mt-1 text-sm text-slate-500">{invitation.invitedBy.full_name} invited you as <span className="font-semibold text-slate-700">{invitation.role}</span>.</p></div><div className="flex shrink-0 gap-2"><Link href={`/dashboard/invitations/${invitation.token}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">View</Link><button type="button" onClick={() => void acceptInvitation(invitation.token)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Accept invitation</button></div></div></article>)}</div>
          : tickets.length === 0 ? <EmptyState label="No support tickets" detail="Your support conversations will appear here after you contact the activation team." /> : <div className="mt-6 space-y-3">{tickets.map((ticket) => <Link key={ticket.id} href={`/dashboard/${workspaceId}/notifications/tickets/${ticket.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-300"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-slate-900">{ticket.subject}</p><p className="mt-1 text-xs text-slate-500">Ticket {ticket.ticket_number.slice(0, 8)} · {new Date(ticket.created_at).toLocaleString()}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{ticket.status.replace("_", " ")}</span></div></Link>)}</div>}
        </section>
      </div>
    </main>
  );
}

function EmptyState({ label, detail }: { label: string; detail: string }) {
  return <div className="mt-12 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-sm font-semibold text-slate-800">{label}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{detail}</p></div>;
}