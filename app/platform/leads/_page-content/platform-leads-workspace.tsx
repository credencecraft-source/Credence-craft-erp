"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, Upload, X } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import { ReportGrid } from "@/components/reports/report-grid-display";
import {
  PLATFORM_LEAD_DEAD_STAGES,
  PLATFORM_LEAD_PAID_STAGES,
  PLATFORM_LEAD_STAGES,
  PLATFORM_LEAD_THIRD_PARTY_STAGES,
  PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES,
  PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES,
  PLATFORM_LEAD_VERIFIED_STAGES,
} from "@/lib/services/platform/platform-lead-constants";

type PlatformLead = {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  company_name: string | null;
  city: string | null;
  source: string | null;
  stage: string;
  nature_of_business: string | null;
  created_at: string;
  updated_at: string;
  recordType: "THIRD_PARTY" | "APP_LOGIN";
  last_login_at?: string;
  workspaceUserId?: string;
};

const LEAD_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "mobile", label: "Mobile" },
  { key: "company_name", label: "Company name" },
  { key: "city", label: "City" },
  { key: "source", label: "Source" },
  { key: "stage", label: "Stage" },
  { key: "stage_action", label: "Change status" },
  { key: "last_login_at", label: "Last login" },
];

type LeadTab = "THIRD_PARTY" | "APP_LOGIN" | "DEAD" | "PAID";
type VerifiedLeadTab = "INTERESTED" | "NOT_INTERESTED";
type LeadTicket = {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  status: string;
  request_type: string;
  callback_date: string | null;
  callback_time: string | null;
  created_at: string;
  updated_at: string;
};

function LeadEditor({
  lead,
  tickets,
  ticketsLoading,
  ticketLoadError,
  onClose,
  onSaved,
}: {
  lead: PlatformLead | null;
  tickets: LeadTicket[];
  ticketsLoading: boolean;
  ticketLoadError: string;
  onClose: () => void;
  onSaved: (leadId: string, movedToThirdParty?: boolean) => void;
}) {
  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [mobile, setMobile] = useState(lead?.mobile ?? "");
  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [city, setCity] = useState(lead?.city ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [stage, setStage] = useState(lead?.stage ?? PLATFORM_LEAD_STAGES[0]);
  const [natureOfBusiness, setNatureOfBusiness] = useState(lead?.nature_of_business ?? "");
  const [detailsTab, setDetailsTab] = useState<"business" | "details" | "activity">("business");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveLead(stage);
  }

  async function saveLead(nextStage: string, movedToThirdParty = false) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        lead ? `/api/platform/leads/${encodeURIComponent(lead.id)}` : "/api/platform/leads",
        {
          method: lead ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, mobile, companyName, city, source, stage: nextStage, natureOfBusiness }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save lead.");
      onSaved(payload.lead.id, movedToThirdParty);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save lead.");
    } finally {
      setSaving(false);
    }
  }

  const completedCallback = tickets.find((ticket) =>
    ticket.request_type === "CALLBACK" && ["RESOLVED", "CLOSED"].includes(ticket.status),
  );
  const scheduledCallback = tickets.find((ticket) =>
    ticket.request_type === "CALLBACK" && ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"].includes(ticket.status),
  );

  return (
    <aside aria-label={lead ? "Edit lead" : "Create lead"} className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:w-[min(42%,34rem)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Platform leads</p>
          <h2 className="mt-1 text-sm font-bold text-slate-900">{lead ? "Edit lead" : "Add lead"}</h2>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onClose} aria-label="Close lead form" title="Close">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <Tabs
        tabs={[
          { value: "business", label: "Nature of Business" },
          { value: "details", label: "Lead Details" },
          { value: "activity", label: "Activity & Callbacks" },
        ]}
        value={detailsTab}
        onChange={(value) => setDetailsTab(value as typeof detailsTab)}
        ariaLabel="Lead details"
      />
      <form onSubmit={submit} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {detailsTab === "business" && (
          <>
            <p className="text-xs text-slate-500">Describe the lead’s business, products, and manufacturing or sourcing needs.</p>
            <Textarea
              label="Nature of Business"
              maxLength={2000}
              rows={8}
              value={natureOfBusiness}
              onChange={(event) => setNatureOfBusiness(event.target.value)}
              placeholder="Business type, products, production scale, and requirements"
            />
          </>
        )}
        {detailsTab === "details" && (
          <>
            <Input label="Name" required minLength={2} maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />
            <Input label="Email" type="email" maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input label="Mobile" type="tel" maxLength={30} value={mobile} onChange={(event) => setMobile(event.target.value)} hint="Include country code. Provide an email or mobile number." />
            <Input label="Company name" maxLength={255} value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            <Input label="City" maxLength={120} value={city} onChange={(event) => setCity(event.target.value)} />
            <Input label="Source" maxLength={120} value={source} onChange={(event) => setSource(event.target.value)} placeholder="e.g. Website, referral, event" />
            <Select label="Stage" required value={stage} onChange={(event) => setStage(event.target.value)} options={PLATFORM_LEAD_STAGES.map((value) => ({ label: value, value }))} />
          </>
        )}
        {detailsTab === "activity" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <LeadActivityInfo label="Lead created" value={lead ? new Date(lead.created_at).toLocaleString() : "Not saved"} />
              <LeadActivityInfo label="Last lead update" value={lead ? new Date(lead.updated_at).toLocaleString() : "Not saved"} />
              <LeadActivityInfo
                label="Last call marked complete"
                value={completedCallback ? new Date(completedCallback.updated_at).toLocaleString() : "Not marked complete"}
              />
              <LeadActivityInfo
                label="Scheduled callback"
                value={scheduledCallback
                  ? `${scheduledCallback.callback_date ?? "Date not set"} ${scheduledCallback.callback_time ?? ""}`
                  : "None scheduled"}
              />
              <LeadActivityInfo label="Tickets" value={`${tickets.length}`} />
            </div>
            {ticketsLoading ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500" role="status">
                Loading lead activity…
              </p>
            ) : ticketLoadError ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{ticketLoadError}</p>
            ) : tickets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No support tickets or callbacks have been recorded for this lead.</p>
            ) : (
              <ul className="space-y-2">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{ticket.subject}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{ticket.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{ticket.request_type === "CALLBACK" ? `Callback · ${ticket.callback_date ?? "Date not set"} ${ticket.callback_time ?? ""}` : "Support ticket"} · Created {new Date(ticket.created_at).toLocaleString()}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {detailsTab !== "activity" && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            {lead && PLATFORM_LEAD_DEAD_STAGES.some((deadStage) => deadStage === lead.stage) && (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void saveLead(PLATFORM_LEAD_THIRD_PARTY_STAGES[0], true)}
              >
                Move to 3rd Party
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {saving ? "Saving..." : lead ? "Save changes" : "Create lead"}
            </Button>
          </div>
        )}
      </form>
    </aside>
  );
}

function LeadActivityInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value}</p></div>;
}

export default function PlatformLeadsWorkspace({
  leads,
  appLogins,
  selectedLead,
  selectedLeadTickets,
}: {
  leads: PlatformLead[];
  appLogins: Array<{
    id: string;
    name: string;
    email: string | null;
    mobile: string | null;
    company_name: string | null;
    city: string | null;
    source: string;
    stage: string;
    last_login_at: string;
  }>;
  selectedLead: PlatformLead | null;
  selectedLeadTickets: LeadTicket[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdFromUrl = searchParams.get("leadId");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [newLead, setNewLead] = useState(false);
  const selectedLeadId = leadIdFromUrl;
  const [leadTickets, setLeadTickets] = useState<LeadTicket[]>(selectedLeadTickets);
  const [ticketsLoadedForLeadId, setTicketsLoadedForLeadId] = useState<string | null>(leadIdFromUrl ?? selectedLead?.id ?? null);
  const [ticketLoadFailure, setTicketLoadFailure] = useState<{ leadId: string; error: string } | null>(null);
  const [stageFilter, setStageFilter] = useState("ALL");
  const [verifiedLeadTab, setVerifiedLeadTab] = useState<VerifiedLeadTab | null>(null);
  const [verifiedStageFilter, setVerifiedStageFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<LeadTab>("THIRD_PARTY");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [movingSelectedLeads, setMovingSelectedLeads] = useState(false);
  const [stageMovementMessage, setStageMovementMessage] = useState("");
  const [stageMovementError, setStageMovementError] = useState("");
  const [bulkStageDialogOpen, setBulkStageDialogOpen] = useState(false);
  const [bulkTargetStage, setBulkTargetStage] = useState("");
  const [statusLeadId, setStatusLeadId] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [ticketLeadId, setTicketLeadId] = useState<string | null>(null);
  const [ticketRequestType, setTicketRequestType] = useState("CALLBACK");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [visibleFields, setVisibleFields] = useState<string[]>(LEAD_FIELDS.map(({ key }) => key));
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const activeSelectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const ticketsLoading = Boolean(selectedLeadId && selectedLeadId !== ticketsLoadedForLeadId);
  const ticketLoadError = ticketLoadFailure?.leadId === selectedLeadId ? ticketLoadFailure.error : "";

  useEffect(() => {
    if (!selectedLeadId || selectedLeadId === ticketsLoadedForLeadId) return;

    const controller = new AbortController();
    void fetch(`/api/platform/leads/${encodeURIComponent(selectedLeadId)}/tickets`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load lead activity.");
        setLeadTickets(payload.tickets as LeadTicket[]);
        setTicketsLoadedForLeadId(selectedLeadId);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setTicketLoadFailure({
          leadId: selectedLeadId,
          error: error instanceof Error ? error.message : "Unable to load lead activity.",
        });
        setTicketsLoadedForLeadId(selectedLeadId);
      });

    return () => controller.abort();
  }, [selectedLeadId, ticketsLoadedForLeadId]);
  const filteredLeads = useMemo<PlatformLead[]>(() => {
    if (activeTab === "APP_LOGIN") {
      return appLogins.map((user) => ({
        ...user,
        id: `app-login:${user.id}`,
        nature_of_business: null,
        created_at: user.last_login_at,
        updated_at: user.last_login_at,
        recordType: "APP_LOGIN" as const,
        workspaceUserId: user.id,
      }));
    }
    const allowedStages = activeTab === "DEAD"
      ? PLATFORM_LEAD_DEAD_STAGES
      : activeTab === "PAID"
        ? PLATFORM_LEAD_PAID_STAGES
        : PLATFORM_LEAD_THIRD_PARTY_STAGES;
    const visibleStages = stageFilter === "VERIFIED"
      ? verifiedLeadTab === "INTERESTED"
        ? PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES
        : verifiedLeadTab === "NOT_INTERESTED"
          ? PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES
          : PLATFORM_LEAD_VERIFIED_STAGES
      : null;
    return leads
      .filter((lead) => allowedStages.some((stage) => stage === lead.stage))
      .filter((lead) => {
        if (stageFilter === "VERIFIED") {
          return visibleStages?.some((stage) => stage === lead.stage) &&
            (verifiedStageFilter === "ALL" || lead.stage === verifiedStageFilter);
        }
        return stageFilter === "ALL" || lead.stage === stageFilter;
      })
      .map((lead) => ({ ...lead, recordType: "THIRD_PARTY" as const }));
  }, [activeTab, appLogins, leads, stageFilter, verifiedLeadTab, verifiedStageFilter]);
  const stageOptions = activeTab === "DEAD"
    ? PLATFORM_LEAD_DEAD_STAGES
    : activeTab === "PAID"
      ? PLATFORM_LEAD_PAID_STAGES
      : PLATFORM_LEAD_THIRD_PARTY_STAGES;
  const tabs: Array<{ id: LeadTab; label: string; count: number }> = [
    {
      id: "THIRD_PARTY",
      label: "3rd Party Leads",
      count: leads.filter((lead) => PLATFORM_LEAD_THIRD_PARTY_STAGES.some((stage) => stage === lead.stage)).length,
    },
    { id: "APP_LOGIN", label: "App Login", count: appLogins.length },
    {
      id: "DEAD",
      label: "Dead",
      count: leads.filter((lead) => PLATFORM_LEAD_DEAD_STAGES.some((stage) => stage === lead.stage)).length,
    },
    {
      id: "PAID",
      label: "Paid",
      count: leads.filter((lead) => PLATFORM_LEAD_PAID_STAGES.some((stage) => stage === lead.stage)).length,
    },
  ];
  const changeVisibleFields = useCallback((next: (string | keyof PlatformLead)[]) => {
    setVisibleFields(next.map(String));
  }, []);

  function closeEditor() {
    setNewLead(false);
    window.history.pushState(null, "", "/platform/leads");
  }

  function openLead(leadId: string) {
    if (activeTab === "APP_LOGIN") {
      const workspaceUserId = leadId.replace(/^app-login:/, "");
      router.push(`/platform/workspace-users/${encodeURIComponent(workspaceUserId)}`);
      return;
    }
    setNewLead(false);
    window.history.pushState(null, "", `/platform/leads?leadId=${encodeURIComponent(leadId)}`);
  }

  function openNewLead() {
    setNewLead(true);
    window.history.pushState(null, "", "/platform/leads");
  }

  async function submitLeadTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticketLeadId) return;
    const lead = leads.find((item) => item.id === ticketLeadId);
    if (!lead) {
      setTicketError("Lead not found. Refresh the page and try again.");
      return;
    }
    setTicketSaving(true);
    setTicketError("");
    try {
      const response = await fetch(`/api/platform/leads/${encodeURIComponent(lead.id)}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `${ticketRequestType === "CALLBACK" ? "Callback" : "Support follow-up"} · ${lead.name}`,
          description: ticketDescription,
          requestType: ticketRequestType,
          callbackDate,
          callbackTime,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create the support ticket.");
      setTicketLeadId(null);
      setTicketRequestType("CALLBACK");
      setCallbackDate("");
      setCallbackTime("");
      setTicketDescription("");
      router.refresh();
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : "Unable to create the support ticket.");
    } finally {
      setTicketSaving(false);
    }
  }

  async function saveLeadStage(stage: string) {
    if (!statusLeadId) return;
    const lead = leads.find((item) => item.id === statusLeadId);
    if (!lead) {
      setStatusError("Lead not found. Refresh the page and try again.");
      return;
    }
    setStatusSaving(true);
    setStatusError("");
    try {
      const response = await fetch(`/api/platform/leads/${encodeURIComponent(lead.id)}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update lead stage.");
      setStatusLeadId(null);
      router.refresh();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Unable to update lead stage.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function moveSelectedLeads(direction: "NEXT" | "PREVIOUS") {
    if (selectedLeadIds.length === 0 || movingSelectedLeads) return;
    setMovingSelectedLeads(true);
    setStageMovementMessage("");
    setStageMovementError("");
    try {
      const response = await fetch("/api/platform/leads/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds, direction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to move lead statuses.");
      setStageMovementMessage(
        `${payload.updatedCount} lead${payload.updatedCount === 1 ? "" : "s"} moved${payload.skippedCount ? `; ${payload.skippedCount} at a status boundary were unchanged` : ""}.`,
      );
      setSelectedLeadIds([]);
      router.refresh();
    } catch (error) {
      setStageMovementError(error instanceof Error ? error.message : "Unable to move lead statuses.");
    } finally {
      setMovingSelectedLeads(false);
    }
  }

  async function updateSelectedNewLeadStage(stage: "Interested For Demo" | "MARK AS FROUD") {
    if (selectedLeadIds.length === 0 || movingSelectedLeads) return;
    setMovingSelectedLeads(true);
    setStageMovementMessage("");
    setStageMovementError("");
    try {
      const response = await fetch("/api/platform/leads/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds, newLeadStage: stage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update new leads.");
      setStageMovementMessage(
        `${payload.updatedCount} lead${payload.updatedCount === 1 ? "" : "s"} moved to ${stage === "Interested For Demo" ? "Interested" : "Mark as Fraud"}.`,
      );
      setSelectedLeadIds([]);
      router.refresh();
    } catch (error) {
      setStageMovementError(error instanceof Error ? error.message : "Unable to update new leads.");
    } finally {
      setMovingSelectedLeads(false);
    }
  }

  async function updateSelectedLeadStage() {
    if (selectedLeadIds.length === 0 || movingSelectedLeads || !bulkTargetStage) return;
    setMovingSelectedLeads(true);
    setStageMovementMessage("");
    setStageMovementError("");
    try {
      const response = await fetch("/api/platform/leads/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds, stage: bulkTargetStage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update lead stages.");
      setStageMovementMessage(
        `${payload.updatedCount} lead${payload.updatedCount === 1 ? "" : "s"} changed to ${bulkTargetStage}${payload.unchangedCount ? `; ${payload.unchangedCount} already had this stage` : ""}.`,
      );
      setSelectedLeadIds([]);
      setBulkStageDialogOpen(false);
      setBulkTargetStage("");
      router.refresh();
    } catch (error) {
      setStageMovementError(error instanceof Error ? error.message : "Unable to update lead stages.");
    } finally {
      setMovingSelectedLeads(false);
    }
  }

  function handleSaved(leadId: string, movedToThirdParty = false) {
    setNewLead(false);
    if (movedToThirdParty) {
      setActiveTab("THIRD_PARTY");
      setStageFilter("ALL");
    }
    router.push(`/platform/leads?leadId=${encodeURIComponent(leadId)}`);
    router.refresh();
  }

  async function uploadWorkbook(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage("");
    setUploadError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/platform/leads/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to import leads.");
      setUploadMessage(`${payload.imported} lead${payload.imported === 1 ? "" : "s"} imported.`);
      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to import leads.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Leads</h1>
          <Tabs
            tabs={tabs.map((tab) => ({
              value: tab.id,
              label: (
                <>
                  {tab.label}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] tabular-nums">
                    {tab.count}
                  </span>
                </>
              ),
            }))}
            value={activeTab}
            onChange={(value) => {
              const nextTab = value as LeadTab;
              setActiveTab(nextTab);
              setStageFilter("ALL");
              setVerifiedLeadTab(null);
              setVerifiedStageFilter("ALL");
              setSelectedLeadIds([]);
              setNewLead(false);
              window.history.pushState(null, "", "/platform/leads");
            }}
            ariaLabel="Lead categories"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-xs text-slate-500">{filteredLeads.length} records</p>
          {activeTab === "THIRD_PARTY" && (
            <>
              <form action="/api/platform/leads/export" method="get">
                <Button type="submit" variant="ghost" size="sm" aria-label="Download leads Excel" title="Download leads Excel" className="min-h-0 px-2 py-1.5">
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
              <Input
                ref={uploadInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={uploadWorkbook}
                className="hidden"
                aria-label="Upload leads workbook"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Upload leads Excel"
                title={uploading ? "Uploading leads Excel" : "Upload leads Excel"}
                disabled={uploading}
                onClick={() => uploadInputRef.current?.click()}
                className="min-h-0 px-2 py-1.5"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </header>

      {uploadMessage && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{uploadMessage}</p>}
      {uploadError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p>}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {activeTab !== "APP_LOGIN" && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter leads by status">
              <Button
                type="button"
                size="sm"
                variant={stageFilter === "ALL" ? "primary" : "secondary"}
                aria-pressed={stageFilter === "ALL"}
                onClick={() => {
                  setStageFilter("ALL");
                  setVerifiedLeadTab(null);
                  setVerifiedStageFilter("ALL");
                  setSelectedLeadIds([]);
                }}
              >
                All
              </Button>
              {activeTab === "THIRD_PARTY" && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={stageFilter === "1-new" ? "primary" : "secondary"}
                    aria-pressed={stageFilter === "1-new"}
                    onClick={() => {
                      setStageFilter("1-new");
                      setVerifiedLeadTab(null);
                      setVerifiedStageFilter("ALL");
                      setSelectedLeadIds([]);
                    }}
                  >
                    New <span className="text-[10px] opacity-75">({leads.filter((lead) => lead.stage === "1-new").length})</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={stageFilter === "VERIFIED" ? "primary" : "secondary"}
                    aria-pressed={stageFilter === "VERIFIED"}
                    onClick={() => {
                      setStageFilter("VERIFIED");
                      setVerifiedLeadTab(null);
                      setVerifiedStageFilter("ALL");
                      setSelectedLeadIds([]);
                    }}
                  >
                    Verified <span className="text-[10px] opacity-75">({leads.filter((lead) => PLATFORM_LEAD_VERIFIED_STAGES.includes(lead.stage as (typeof PLATFORM_LEAD_VERIFIED_STAGES)[number])).length})</span>
                  </Button>
                </>
              )}
              {stageOptions
                .filter((stage) =>
                  activeTab !== "THIRD_PARTY" ||
                  (stage !== "1-new" &&
                    !PLATFORM_LEAD_VERIFIED_STAGES.includes(stage as (typeof PLATFORM_LEAD_VERIFIED_STAGES)[number])),
                )
                .map((stage) => (
                  <Button
                    key={stage}
                    type="button"
                    size="sm"
                    variant={stageFilter === stage ? "primary" : "secondary"}
                    aria-pressed={stageFilter === stage}
                    onClick={() => {
                      setStageFilter(stage);
                      setVerifiedLeadTab(null);
                      setVerifiedStageFilter("ALL");
                      setSelectedLeadIds([]);
                    }}
                  >
                    {stage} <span className="text-[10px] opacity-75">({leads.filter((lead) => lead.stage === stage).length})</span>
                  </Button>
                ))}
            </div>
          )}
          {activeTab === "THIRD_PARTY" && stageFilter === "VERIFIED" && (
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Verified lead interest">
                {([
                  {
                    id: "INTERESTED" as const,
                    label: "Interested",
                    stages: PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES,
                  },
                  {
                    id: "NOT_INTERESTED" as const,
                    label: "Not Interested / Dead",
                    stages: PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES,
                  },
                ]).map((tab) => (
                  <Button
                    key={tab.id}
                    type="button"
                    size="sm"
                    variant={verifiedLeadTab === tab.id ? "primary" : "secondary"}
                    aria-pressed={verifiedLeadTab === tab.id}
                    onClick={() => {
                      setVerifiedLeadTab(tab.id);
                      setVerifiedStageFilter("ALL");
                      setSelectedLeadIds([]);
                    }}
                  >
                    {tab.label} <span className="text-[10px] opacity-75">({leads.filter((lead) => tab.stages.some((stage) => stage === lead.stage)).length})</span>
                  </Button>
                ))}
              </div>
              {verifiedLeadTab && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${verifiedLeadTab === "INTERESTED" ? "Interested" : "Not interested"} lead statuses`}>
                  {verifiedLeadTab === "NOT_INTERESTED" && (
                    <Button
                      type="button"
                      size="sm"
                      variant={verifiedStageFilter === "ALL" ? "primary" : "secondary"}
                      aria-pressed={verifiedStageFilter === "ALL"}
                      onClick={() => {
                        setVerifiedStageFilter("ALL");
                        setSelectedLeadIds([]);
                      }}
                    >
                      All
                    </Button>
                  )}
                  {(verifiedLeadTab === "INTERESTED"
                    ? PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES
                    : PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES
                  ).map((stage) => (
                    <Button
                      key={stage}
                      type="button"
                      size="sm"
                      variant={verifiedStageFilter === stage ? "primary" : "secondary"}
                      aria-pressed={verifiedStageFilter === stage}
                      onClick={() => {
                        setVerifiedStageFilter(stage);
                        setSelectedLeadIds([]);
                      }}
                    >
                      {stage === "2-Potential" ? "Potential" : stage === "3-Dead" ? "Dead" : stage}
                      <span className="text-[10px] opacity-75">({leads.filter((lead) => lead.stage === stage).length})</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          <ReportGrid
            title={tabs.find((tab) => tab.id === activeTab)?.label ?? "Leads"}
            records={filteredLeads}
            fields={LEAD_FIELDS}
            visibleFields={visibleFields}
            onVisibleFieldsChange={changeVisibleFields}
            storageKey="platform-leads-report-columns-v1"
            rowIdSelector={(lead) => lead.id}
            selectedIds={activeTab === "THIRD_PARTY" ? selectedLeadIds : []}
            selectable={activeTab === "THIRD_PARTY"}
            onToggleRowSelection={(leadId, checked) => {
              setSelectedLeadIds((current) =>
                checked
                  ? [...new Set([...current, leadId])]
                  : current.filter((id) => id !== leadId),
              );
            }}
            onToggleSelectAll={(checked) => {
              setSelectedLeadIds(checked ? filteredLeads.map((lead) => lead.id) : []);
            }}
            toolbarActions={activeTab === "THIRD_PARTY" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={selectedLeadIds.length === 0 || movingSelectedLeads}
                  onClick={() => {
                    setStageMovementError("");
                    setBulkTargetStage("");
                    setBulkStageDialogOpen(true);
                  }}
                  title="Set the selected leads to a stage"
                  className="h-7 px-2 text-[11px]"
                >
                  Bulk stage change{selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ""}
                </Button>
                {stageFilter === "1-new" ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={selectedLeadIds.length === 0 || movingSelectedLeads}
                      onClick={() => void updateSelectedNewLeadStage("Interested For Demo")}
                      title="Mark selected new leads as interested"
                      className="h-7 px-2 text-[11px]"
                    >
                      Interested{selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ""}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={selectedLeadIds.length === 0 || movingSelectedLeads}
                      onClick={() => void updateSelectedNewLeadStage("MARK AS FROUD")}
                      title="Mark selected new leads as fraud"
                      className="h-7 px-2 text-[11px]"
                    >
                      Mark as Fraud{selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ""}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={selectedLeadIds.length === 0 || movingSelectedLeads}
                      onClick={() => void moveSelectedLeads("PREVIOUS")}
                      title="Move selected leads to their previous status"
                      className="h-7 px-2 text-[11px]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Move back{selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ""}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={selectedLeadIds.length === 0 || movingSelectedLeads}
                      onClick={() => void moveSelectedLeads("NEXT")}
                      title="Move selected leads to their next status"
                      className="h-7 px-2 text-[11px]"
                    >
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      Move to next{selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ""}
                    </Button>
                  </>
                )}
              </>
            ) : undefined}
            wrapCells
            onRowClick={openLead}
            onRowAction={(leadId) => {
              setTicketLeadId(leadId);
              setTicketError("");
            }}
            rowActionLabel="Create ticket"
            rowActionDisabledSelector={(lead) => lead.recordType === "APP_LOGIN"}
            onNewOrder={activeTab === "THIRD_PARTY" ? openNewLead : undefined}
            newActionLabel="Add lead"
            emptyMessage={activeTab === "APP_LOGIN" ? "No workspace accounts have logged in yet." : "No leads match this category."}
            renderCell={(fieldKey, lead) => {
              if (fieldKey === "last_login_at") return lead.last_login_at ? new Date(lead.last_login_at).toLocaleString() : "—";
              if (fieldKey === "stage_action" && lead.recordType !== "APP_LOGIN") {
                return (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={statusSaving}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStatusLeadId(lead.id);
                      setStatusError("");
                    }}
                  >
                    Change
                  </Button>
                );
              }
              if (fieldKey === "stage_action") return "—";
              return lead[fieldKey as keyof PlatformLead] || "—";
            }}
          />
          {stageMovementMessage && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{stageMovementMessage}</p>}
          {stageMovementError && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{stageMovementError}</p>}
        </div>
        {activeTab !== "APP_LOGIN" && (newLead || activeSelectedLead) && (
          <LeadEditor
            key={newLead ? "new-lead" : activeSelectedLead?.id}
            lead={newLead ? null : activeSelectedLead}
            tickets={newLead ? [] : selectedLeadId === ticketsLoadedForLeadId ? leadTickets : []}
            ticketsLoading={ticketsLoading}
            ticketLoadError={ticketLoadError}
            onClose={closeEditor}
            onSaved={handleSaved}
          />
        )}
      </div>
      <Modal
        open={bulkStageDialogOpen}
        onClose={() => {
          if (!movingSelectedLeads) {
            setBulkStageDialogOpen(false);
            setStageMovementError("");
          }
        }}
        ariaLabel="Bulk change lead stages"
        ariaLabelledBy="bulk-stage-title"
        size="sm"
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void updateSelectedLeadStage();
          }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Lead stages</p>
            <h2 id="bulk-stage-title" className="mt-1 text-lg font-bold text-slate-900">
              Change {selectedLeadIds.length} selected lead{selectedLeadIds.length === 1 ? "" : "s"}
            </h2>
          </div>
          <Select
            label="Target stage"
            required
            value={bulkTargetStage}
            disabled={movingSelectedLeads}
            onChange={(event) => setBulkTargetStage(event.target.value)}
            options={[
              { label: "Select a stage", value: "" },
              ...PLATFORM_LEAD_STAGES.map((stage) => ({ label: stage, value: stage })),
            ]}
          />
          {movingSelectedLeads && <p role="status" className="text-xs text-slate-500">Updating selected leads…</p>}
          {stageMovementError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{stageMovementError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={movingSelectedLeads}
              onClick={() => {
                setBulkStageDialogOpen(false);
                setStageMovementError("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={movingSelectedLeads || !bulkTargetStage}>
              {movingSelectedLeads ? "Updating…" : "Update stages"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(statusLeadId)}
        onClose={() => {
          if (!statusSaving) {
            setStatusLeadId(null);
            setStatusError("");
          }
        }}
        ariaLabel="Change lead status"
        ariaLabelledBy="lead-status-title"
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Lead status</p>
            <h2 id="lead-status-title" className="mt-1 text-lg font-bold text-slate-900">
              Change status{statusLeadId ? ` · ${leads.find((lead) => lead.id === statusLeadId)?.name ?? ""}` : ""}
            </h2>
          </div>
          <Select
            label="Status"
            value={statusLeadId ? leads.find((lead) => lead.id === statusLeadId)?.stage ?? "" : ""}
            disabled={statusSaving}
            onChange={(event) => void saveLeadStage(event.target.value)}
            options={PLATFORM_LEAD_STAGES.map((stage) => ({ label: stage, value: stage }))}
          />
          {statusSaving && <p role="status" className="text-xs text-slate-500">Saving status…</p>}
          {statusError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{statusError}</p>}
          <div className="flex justify-end border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={statusSaving}
              onClick={() => setStatusLeadId(null)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(ticketLeadId)}
        onClose={() => {
          if (ticketSaving) return;
          setTicketLeadId(null);
          setTicketError("");
        }}
        ariaLabel="Create lead support ticket"
        ariaLabelledBy="lead-ticket-title"
        size="md"
      >
        <form onSubmit={submitLeadTicket} className="space-y-4 p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Lead support</p>
            <h2 id="lead-ticket-title" className="mt-1 text-lg font-bold text-slate-900">
              Create ticket{ticketLeadId ? ` · ${leads.find((lead) => lead.id === ticketLeadId)?.name ?? ""}` : ""}
            </h2>
          </div>
          <Select
            label="Request type"
            required
            value={ticketRequestType}
            onChange={(event) => setTicketRequestType(event.target.value)}
            options={[
              { label: "Callback", value: "CALLBACK" },
              { label: "Support follow-up", value: "TICKET" },
            ]}
          />
          {ticketRequestType === "CALLBACK" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Callback date" required type="date" value={callbackDate} onChange={(event) => setCallbackDate(event.target.value)} />
              <Input label="Callback time" required type="time" value={callbackTime} onChange={(event) => setCallbackTime(event.target.value)} />
            </div>
          )}
          <Textarea
            label="Description or remarks"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            value={ticketDescription}
            onChange={(event) => setTicketDescription(event.target.value)}
            placeholder="Record the request, discussion, and next action"
          />
          {ticketError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{ticketError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setTicketLeadId(null)} disabled={ticketSaving}>Cancel</Button>
            <Button type="submit" disabled={ticketSaving} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {ticketSaving ? "Creating..." : "Create support ticket"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
