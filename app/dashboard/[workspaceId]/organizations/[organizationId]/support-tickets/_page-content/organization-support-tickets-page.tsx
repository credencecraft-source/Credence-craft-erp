"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Plus, TicketCheck } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import WorkspaceTicketChat from "@/app/dashboard/[workspaceId]/notifications/tickets/[ticketId]/workspace-ticket-chat";

type SupportTicket = {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  request_type: string;
  created_at: Date;
  updated_at: Date;
  submittedBy: { full_name: string };
};

type SelectedTicket = {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  request_type: string;
  created_at: string;
  submittedBy: string;
  messages: Array<{ id: string; body: string; senderType: string; senderName: string; createdAt: string }>;
};

export default function OrganizationSupportTicketsPage({
  workspaceId,
  organizationId,
  tickets,
  selectedTicket,
}: {
  workspaceId: string;
  organizationId: string;
  tickets: SupportTicket[];
  selectedTicket: SelectedTicket | null;
}) {
  const router = useRouter();
  const [newTicket, setNewTicket] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ticketFilter, setTicketFilter] = useState<"OPEN" | "CLOSED" | "ALL">("OPEN");
  const openTickets = tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status));
  const closedTickets = tickets.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status));
  const visibleTickets = ticketFilter === "OPEN"
    ? openTickets
    : ticketFilter === "CLOSED" ? closedTickets : tickets;

  async function submitTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/support-tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, priority }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create ticket.");
      setSubject("");
      setDescription("");
      setPriority("NORMAL");
      setNewTicket(false);
      router.push(`/dashboard/${workspaceId}/organizations/${encodeURIComponent(organizationId)}/support-tickets?ticketId=${encodeURIComponent(result.ticket.id)}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create ticket.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex h-full min-h-[32rem] max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Organization support</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Support tickets</h1>
        </div>
        <Button type="button" onClick={() => { setNewTicket(true); setError(""); }} className="bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> New ticket
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="min-h-0 border-b border-slate-200 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">{ticketFilter === "CLOSED" ? "Closed tickets" : ticketFilter === "ALL" ? "All tickets" : "Open tickets"}</h2>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{ticketFilter === "CLOSED" ? closedTickets.length : ticketFilter === "ALL" ? tickets.length : openTickets.length}</span>
          </div>
          <div className="flex gap-1 px-3 pb-3">
            {(["OPEN", "CLOSED", "ALL"] as const).map((filter) => <Button key={filter} type="button" variant="ghost" size="sm" onClick={() => setTicketFilter(filter)} className={`min-h-0 rounded-md px-2.5 py-1 text-[11px] ${ticketFilter === filter ? "bg-emerald-100 text-emerald-800" : "text-slate-500 hover:bg-slate-100"}`}>{filter === "OPEN" ? "Open" : filter === "CLOSED" ? "Closed" : "All"}</Button>)}
          </div>
          <div className="max-h-[28rem] overflow-y-auto md:max-h-[calc(100dvh-16rem)]">
            {visibleTickets.map((ticket) => (
              <Button
                type="button"
                key={ticket.id}
                onClick={() => { setNewTicket(false); router.push(`?ticketId=${encodeURIComponent(ticket.id)}`); }}
                variant="ghost"
                className={`flex min-h-0 w-full justify-start rounded-none border-t border-slate-100 px-4 py-4 text-left ${selectedTicket?.id === ticket.id ? "bg-emerald-50/70" : "hover:bg-slate-50"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-semibold text-slate-900">{ticket.subject}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{ticket.status.replace("_", " ")}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">#{ticket.ticket_number.slice(0, 8)} · {ticket.updated_at.toLocaleDateString()}</p>
              </Button>
            ))}
            {visibleTickets.length === 0 && <div className="border-t border-slate-100 px-4 py-10 text-center"><TicketCheck className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">{ticketFilter === "CLOSED" ? "No closed tickets" : "No open tickets"}</p><p className="mt-1 text-xs text-slate-500">Create a ticket and your organization can follow the conversation here.</p></div>}
          </div>
        </aside>

        <div className="min-w-0 overflow-y-auto p-5">
          {newTicket ? (
            <form onSubmit={submitTicket} className="mx-auto max-w-2xl space-y-4">
              <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">New request</p><h2 className="mt-1 text-lg font-bold text-slate-900">Tell support what you need</h2></div>
              <Input label="Subject" required minLength={3} maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} />
              <Select label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} options={[{ label: "Low", value: "LOW" }, { label: "Normal", value: "NORMAL" }, { label: "High", value: "HIGH" }, { label: "Urgent", value: "URGENT" }]} />
              <Textarea label="Description" required minLength={10} maxLength={5000} rows={7} value={description} onChange={(event) => setDescription(event.target.value)} />
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setNewTicket(false)}>Cancel</Button><Button disabled={saving} type="submit">{saving ? "Creating..." : "Create ticket"}</Button></div>
            </form>
          ) : selectedTicket ? (
            <div className="space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Ticket #{selectedTicket.ticket_number.slice(0, 8)} · {selectedTicket.status.replace("_", " ")}</p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">{selectedTicket.subject}</h2>
                <p className="mt-1 text-xs text-slate-500">Opened by {selectedTicket.submittedBy} · {new Date(selectedTicket.created_at).toLocaleString()}</p>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedTicket.description}</p>
              </div>
              <WorkspaceTicketChat organizationId={organizationId} ticketId={selectedTicket.id} initialMessages={selectedTicket.messages} />
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center"><MessageSquareText className="h-9 w-9 text-slate-300" /><h2 className="mt-3 text-sm font-semibold text-slate-800">Select a ticket</h2><p className="mt-1 max-w-sm text-sm text-slate-500">Ticket conversations are shared with active members of this organization.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}
