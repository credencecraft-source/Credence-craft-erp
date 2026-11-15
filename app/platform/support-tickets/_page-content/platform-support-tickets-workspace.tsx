"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { ReportGrid } from "@/components/reports/report-grid-display";
import PlatformTicketChat from "../[ticketId]/platform-ticket-chat";

type PlatformTicket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  request_type: string;
  callback_date: string | null;
  callback_time: string | null;
  created_at: string;
  updated_at: string;
  organization: { organization_name: string; organization_id: string } | null;
  submittedBy: { full_name: string; email: string | null } | null;
  platformLead: { id: string; name: string; email: string | null; mobile: string | null; company_name: string | null } | null;
  createdByPlatformAdmin: { full_name: string; email: string } | null;
};

type TicketMessage = { id: string; body: string; senderType: string; senderName: string; createdAt: string };
type SelectedTicket = PlatformTicket & { description: string; messages: TicketMessage[] };
type TicketOrganization = {
  organizationId: string;
  organizationName: string;
  contacts: Array<{ id: string; full_name: string; email: string | null }>;
};

const TICKET_STATUSES = ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const OPEN_STATUSES = ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"];
const TICKET_FIELDS = [
  { key: "ticket_number", label: "Ticket" },
  { key: "subject", label: "Subject" },
  { key: "organization", label: "Organisation" },
  { key: "submittedBy", label: "Submitted by" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "request_type", label: "Request type" },
  { key: "updated_at", label: "Last updated" },
];
const DEFAULT_VISIBLE_FIELDS = [
  "ticket_number",
  "subject",
  "organization",
  "status",
  "priority",
  "updated_at",
];

export default function PlatformSupportTicketsWorkspace({
  tickets,
  organizations,
  selectedTicket,
}: {
  tickets: PlatformTicket[];
  organizations: TicketOrganization[];
  selectedTicket: SelectedTicket | null;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [visibleFields, setVisibleFields] = useState<string[]>(DEFAULT_VISIBLE_FIELDS);
  const [newTicket, setNewTicket] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [submittedByUserId, setSubmittedByUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [requestType, setRequestType] = useState("TICKET");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusOverride, setStatusOverride] = useState<{ ticketId: string; value: string } | null>(null);
  const [extensionHours, setExtensionHours] = useState("24");
  const [message, setMessage] = useState("");
  const status = statusOverride && selectedTicket && statusOverride.ticketId === selectedTicket.id
    ? statusOverride.value
    : selectedTicket?.status ?? "OPEN";

  const selectedOrganization = organizations.find((item) => item.organizationId === organizationId);
  const filteredTickets = useMemo(
    () => tickets.filter((ticket) =>
      statusFilter === "ALL" ||
      (statusFilter === "OPEN" ? OPEN_STATUSES.includes(ticket.status) : ticket.status === statusFilter),
    ),
    [tickets, statusFilter],
  );
  const changeVisibleFields = useCallback((next: (string | keyof PlatformTicket)[]) => {
    setVisibleFields(next.map(String));
  }, []);

  function openTicket(ticketId: string) {
    setNewTicket(false);
    setError("");
    router.push(`/platform/support-tickets?ticketId=${encodeURIComponent(ticketId)}`);
  }

  function closeDetails() {
    setNewTicket(false);
    setError("");
    router.push("/platform/support-tickets");
  }

  async function submitTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/platform/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, submittedByUserId, subject, description, priority, requestType, callbackDate, callbackTime }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create ticket.");
      setOrganizationId("");
      setSubmittedByUserId("");
      setSubject("");
      setDescription("");
      setRequestType("TICKET");
      setNewTicket(false);
      openTicket(payload.ticket.id);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create ticket.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/support-tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update ticket status.");
      setStatusOverride(null);
      router.refresh();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update ticket status.");
    } finally {
      setSaving(false);
    }
  }

  async function extendTrial() {
    if (!selectedTicket) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/support-tickets/${selectedTicket.id}/trial-extension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: Number(extensionHours) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to extend this trial.");
      setMessage("Trial extended. The related request ticket has been resolved.");
      router.refresh();
    } catch (extensionError) {
      setError(extensionError instanceof Error ? extensionError.message : "Unable to extend this trial.");
    } finally {
      setSaving(false);
    }
  }

  const openCount = tickets.filter((ticket) => OPEN_STATUSES.includes(ticket.status)).length;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-xl font-bold text-slate-900">Support tickets</h1>
        </div>
        <p className="text-xs text-slate-500">{openCount} open · {tickets.length} total</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <ReportGrid
            title="Support ticket report"
            records={filteredTickets}
            fields={TICKET_FIELDS}
            visibleFields={visibleFields}
            onVisibleFieldsChange={changeVisibleFields}
            storageKey="platform-support-tickets-report-columns-v1"
            rowIdSelector={(ticket) => ticket.id}
            selectedIds={selectedTicket ? [selectedTicket.id] : []}
            selectable={false}
            onRowClick={openTicket}
            statusOptions={["OPEN", "ALL", ...TICKET_STATUSES.filter((value) => value !== "OPEN")]}
            selectedStatus={statusFilter}
            onStatusChange={setStatusFilter}
            onNewOrder={() => {
              setNewTicket(true);
              setError("");
              router.push("/platform/support-tickets");
            }}
            newActionLabel="Create ticket"
            emptyMessage="No matching support tickets."
            renderCell={(fieldKey, ticket) => {
              if (fieldKey === "ticket_number") {
                return <span className="font-mono font-semibold">#{ticket.ticket_number.slice(0, 8)}</span>;
              }
              if (fieldKey === "organization") {
                if (ticket.platformLead) {
                  return (
                    <a
                      className="font-medium text-emerald-700 hover:underline"
                      href={`/platform/leads?leadId=${encodeURIComponent(ticket.platformLead.id)}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {ticket.platformLead.company_name ?? ticket.platformLead.name}
                    </a>
                  );
                }
                return ticket.organization?.organization_name ?? "—";
              }
              if (fieldKey === "submittedBy") return ticket.submittedBy?.full_name ?? ticket.platformLead?.name ?? "—";
              if (fieldKey === "status") {
                return (
                  <Badge className={OPEN_STATUSES.includes(ticket.status) ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>
                    {ticket.status.replaceAll("_", " ")}
                  </Badge>
                );
              }
              if (fieldKey === "priority") {
                return (
                  <Badge className={ticket.priority === "URGENT" || ticket.priority === "HIGH" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}>
                    {ticket.priority}
                  </Badge>
                );
              }
              if (fieldKey === "request_type") {
                return ticket.request_type === "CALLBACK" ? "Demo / callback" : "Support ticket";
              }
              if (fieldKey === "updated_at") {
                return new Date(ticket.updated_at).toLocaleString();
              }
              const value = ticket[fieldKey as keyof PlatformTicket];
              return typeof value === "string" ? value : "—";
            }}
          />
        </div>

        {(newTicket || selectedTicket) && (
          <aside aria-label={newTicket ? "Create support ticket" : "Ticket details"} className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:w-[min(48%,42rem)]">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  {newTicket ? "Platform-created request" : `Ticket #${selectedTicket?.ticket_number.slice(0, 8)}`}
                </p>
                <h2 className="mt-1 truncate text-sm font-bold text-slate-900">
                  {newTicket ? "Create ticket" : selectedTicket?.subject}
                </h2>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={closeDetails} aria-label="Close ticket details" title="Close">
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {newTicket ? (
            <form onSubmit={submitTicket} className="space-y-4">
              <p className="text-sm text-slate-500">The selected organization contact will see this ticket in their support workspace.</p>
              <Select label="Organization" required value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setSubmittedByUserId(""); }} options={[{ label: "Select an organization", value: "" }, ...organizations.map((item) => ({ label: item.organizationName, value: item.organizationId }))]} />
              <Select label="Organization contact" required value={submittedByUserId} onChange={(event) => setSubmittedByUserId(event.target.value)} disabled={!selectedOrganization} options={[{ label: "Select a contact", value: "" }, ...(selectedOrganization?.contacts.map((contact) => ({ label: `${contact.full_name} · ${contact.email ?? "No email"}`, value: contact.id })) ?? [])]} />
              <Select label="Request type" value={requestType} onChange={(event) => setRequestType(event.target.value)} options={[{ label: "Support ticket", value: "TICKET" }, { label: "Demo / meeting / callback", value: "CALLBACK" }]} />
              {requestType === "CALLBACK" && <div className="grid gap-3 sm:grid-cols-2"><Input label="Preferred date" required type="date" value={callbackDate} onChange={(event) => setCallbackDate(event.target.value)} /><Input label="Preferred time" required type="time" value={callbackTime} onChange={(event) => setCallbackTime(event.target.value)} /></div>}
              <Input label="Subject" required minLength={3} maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} />
              <Select label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} options={[{ label: "Low", value: "LOW" }, { label: "Normal", value: "NORMAL" }, { label: "High", value: "HIGH" }, { label: "Urgent", value: "URGENT" }]} />
              <Textarea label="Description" required minLength={10} maxLength={5000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={closeDetails}>Cancel</Button><Button disabled={saving} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">{saving ? "Creating..." : "Create ticket"}</Button></div>
            </form>
          ) : selectedTicket ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Ticket #{selectedTicket.ticket_number.slice(0, 8)} · {selectedTicket.request_type}</p><h2 className="mt-2 text-xl font-bold text-slate-900">{selectedTicket.subject}</h2><p className="mt-1 text-sm text-slate-500">{selectedTicket.platformLead ? <><a className="font-medium text-emerald-700 hover:underline" href={`/platform/leads?leadId=${encodeURIComponent(selectedTicket.platformLead.id)}`}>{selectedTicket.platformLead.name}</a> · {selectedTicket.platformLead.company_name ?? "Prospect"} · {selectedTicket.platformLead.email ?? selectedTicket.platformLead.mobile ?? "No contact details"}</> : <>{selectedTicket.organization?.organization_name ?? "Organisation"} · {selectedTicket.submittedBy?.full_name ?? "Contact"} · {selectedTicket.submittedBy?.email ?? ""}</>}</p><p className="mt-1 text-xs text-slate-500">{selectedTicket.createdByPlatformAdmin ? `Created by platform: ${selectedTicket.createdByPlatformAdmin.full_name}` : `Submitted by organization · ${new Date(selectedTicket.created_at).toLocaleString()}`}</p></div>
                <form onSubmit={updateStatus} className="flex items-center gap-2"><Select aria-label="Ticket status" value={status} onChange={(event) => setStatusOverride({ ticketId: selectedTicket.id, value: event.target.value })} className="py-2 text-xs">{TICKET_STATUSES.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</Select><Button disabled={saving || status === selectedTicket.status} type="submit" size="sm" className="bg-slate-900 text-white hover:bg-slate-800">Save status</Button></form>
              </div>
              <div className="grid gap-3 sm:grid-cols-3"><Info label="Priority" value={selectedTicket.priority} /><Info label="Created" value={new Date(selectedTicket.created_at).toLocaleString()} /><Info label="Last updated" value={new Date(selectedTicket.updated_at).toLocaleString()} /></div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedTicket.description}</p>
              {selectedTicket.request_type === "CALLBACK" && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Preferred: {selectedTicket.callback_date} at {selectedTicket.callback_time}</p>}
              {selectedTicket.subject === "Trial extension request" && OPEN_STATUSES.includes(selectedTicket.status) && <div className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-amber-900">Trial extension review</p><p className="mt-1 text-xs text-amber-800">Grant an extension to this organization. The related open request is resolved automatically.</p></div><Select aria-label="Trial extension hours" value={extensionHours} onChange={(event) => setExtensionHours(event.target.value)} className="py-1.5"><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">168 hours</option></Select><Button type="button" onClick={() => void extendTrial()} disabled={saving} size="sm" className="bg-amber-700 text-white hover:bg-amber-800">Extend and resolve</Button></div>}
              {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <PlatformTicketChat ticketId={selectedTicket.id} initialMessages={selectedTicket.messages} leadTicket={Boolean(selectedTicket.platformLead)} />
            </div>
          ) : null}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>;
}
