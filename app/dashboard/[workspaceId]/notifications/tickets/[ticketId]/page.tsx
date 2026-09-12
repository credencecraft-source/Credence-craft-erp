import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getSupportTicket } from "@/lib/services/organizations/support-ticket-service";
import WorkspaceTicketChat from "./workspace-ticket-chat";

export default async function WorkspaceTicketPage({ params }: { params: Promise<{ workspaceId: string; ticketId: string }> }) {
  const user = await requireSessionUser();
  const { workspaceId, ticketId } = await params;
  const ticket = await getSupportTicket(ticketId);
  if (!ticket || ticket.submittedBy.id !== user.id) notFound();

  return <main className="mx-auto max-w-4xl space-y-6 px-5 py-8 sm:px-8"><Link href={`/dashboard/${workspaceId}/notifications`} className="text-sm font-semibold text-emerald-700">← Back to notifications</Link><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Support ticket {ticket.ticket_number.slice(0, 8)}</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{ticket.subject}</h1><p className="mt-2 text-sm text-slate-500">Status: <span className="font-semibold text-slate-800">{ticket.status.replace("_", " ")}</span> · Created {ticket.created_at.toLocaleString()}</p><p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">{ticket.description}</p></section><WorkspaceTicketChat organizationId={ticket.organization.organization_id} ticketId={ticket.id} initialMessages={ticket.messages.map((message) => ({ id: message.id, body: message.body, senderType: message.sender_type, senderName: message.workspaceUser?.full_name || message.platformAdmin?.full_name || "Support", createdAt: message.created_at.toISOString() }))} /></main>;
}
