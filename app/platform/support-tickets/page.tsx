import { redirect } from "next/navigation";
import Link from "next/link";

import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listSupportTickets, updateSupportTicketStatus } from "@/lib/services/organizations/support-ticket-service";

const statuses = ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default async function PlatformSupportTicketsPage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string }> }) {
  await requirePlatformSessionAdmin();
  const query = (await searchParams) ?? {};
  const tickets = await listSupportTickets();

  async function changeStatus(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await updateSupportTicketStatus(String(formData.get("id")), String(formData.get("status")));
    } catch (error) {
      redirect(`/platform/support-tickets?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update ticket.")}`);
    }
    redirect("/platform/support-tickets?success=Ticket status updated.");
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform Admin</p>
          <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
          <p className="mt-1 text-sm text-slate-500">Review requests submitted by organization users and update their status.</p>
        </div>
        {query.error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{query.error}</p>}
        {query.success && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{query.success}</p>}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Table>
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Submitted by</th><th className="px-4 py-3">Request</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created date</th><th className="px-4 py-3">Created time</th></tr></thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-emerald-700">{ticket.request_type === "CALLBACK" ? "Call back" : "Ticket"}</td>
                  <td className="px-4 py-3"><Link href={`/platform/support-tickets/${ticket.id}`} className="font-mono text-[10px] font-semibold text-emerald-700 hover:text-emerald-900">{ticket.ticket_number.slice(0, 8)}</Link></td>
                  <td className="px-4 py-3"><div className="font-semibold text-slate-900">{ticket.organization.organization_name}</div><div className="font-mono text-[10px] text-slate-400">{ticket.organization.organization_id}</div></td>
                  <td className="px-4 py-3"><div className="font-semibold text-slate-800">{ticket.submittedBy.full_name}</div><div className="text-slate-500">{ticket.submittedBy.email}</div></td>
                  <td className="max-w-sm px-4 py-3"><div className="font-semibold text-slate-900">{ticket.subject}</div><p className="mt-1 whitespace-pre-wrap text-slate-500">{ticket.description}</p>{ticket.request_type === "CALLBACK" && <p className="mt-2 font-semibold text-emerald-700">Preferred: {ticket.callback_date} at {ticket.callback_time}</p>}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{ticket.priority}</td>
                  <td className="px-4 py-3"><form action={changeStatus} className="flex items-center gap-2"><input type="hidden" name="id" value={ticket.id} /><select name="status" defaultValue={ticket.status} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">{statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select><button type="submit" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">Save</button></form></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{ticket.created_at.toLocaleDateString()}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{ticket.created_at.toLocaleTimeString()}</td>
                </tr>
              ))}
              {tickets.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">No support requests yet.</td></tr>}
            </tbody>
          </Table>
        </div>
      </Section>
    </Page>
  );
}
