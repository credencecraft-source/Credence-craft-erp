import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getSupportTicket, updateSupportTicketStatus } from "@/lib/services/organizations/support-ticket-service";
import PlatformTicketChat from "./platform-ticket-chat";

export default async function PlatformSupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const admin = await requirePlatformSessionAdmin();
  const { ticketId } = await params;
  const ticket = await getSupportTicket(ticketId);
  if (!ticket) notFound();

  async function changeStatus(formData: FormData) {
    "use server";
    await updateSupportTicketStatus(ticketId, String(formData.get("status")));
    redirect(`/platform/support-tickets/${ticketId}`);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <Link href="/platform/support-tickets" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">← Back to support tickets</Link>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Ticket {ticket.ticket_number.slice(0, 8)}</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{ticket.subject}</h1><p className="mt-2 text-sm text-slate-500">{ticket.organization.organization_name} · {ticket.submittedBy.full_name} · {ticket.submittedBy.email}</p></div>
          <div className="flex flex-wrap items-center gap-2"><form action={changeStatus}><button name="status" value="ACTIVE" type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Active</button></form><form action={changeStatus}><button name="status" value="HOLD" type="submit" className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600">Hold</button></form><form action={changeStatus}><button name="status" value="CLOSED" type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Closed</button></form></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Request</p><p className="mt-1 text-sm font-semibold text-slate-900">{ticket.request_type}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Priority</p><p className="mt-1 text-sm font-semibold text-slate-900">{ticket.priority}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Created date</p><p className="mt-1 text-sm font-semibold text-slate-900">{ticket.created_at.toLocaleDateString()}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Created time</p><p className="mt-1 text-sm font-semibold text-slate-900">{ticket.created_at.toLocaleTimeString()}</p></div></div>
        <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">{ticket.description}</p>
      </section>
      <PlatformTicketChat ticketId={ticket.id} adminId={admin.id} initialMessages={ticket.messages.map((message) => ({ id: message.id, body: message.body, senderType: message.sender_type, senderName: message.workspaceUser?.full_name || message.platformAdmin?.full_name || "Support", createdAt: message.created_at.toISOString() }))} />
    </main>
  );
}
