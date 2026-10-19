"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, LoaderCircle, Mic, RefreshCw, Settings2, Square, Upload, X } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import { ReportGrid } from "@/components/reports/report-grid-display";
import {
  PLATFORM_LEAD_DEAD_STAGES,
  PLATFORM_LEAD_NOT_INTERESTED_STAGES,
  PLATFORM_LEAD_PAID_STAGES,
  PLATFORM_LEAD_STAGES,
  PLATFORM_LEAD_THIRD_PARTY_STAGES,
  PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES,
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
  quick_note: string | null;
  created_at: string;
  updated_at: string;
  campaign_date: string | null;
  last_campaign_date: string | null;
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
  { key: "created_at", label: "Added date & time" },
  { key: "source", label: "Source" },
  { key: "stage", label: "Stage" },
];

const LEAD_ROW_STAGE_ACTIONS: Record<
  string,
  Array<{ label: string; stage: string; variant: "primary" | "secondary" | "destructive" }>
> = {
  Verification: [
    { label: "Need To Call", stage: "Need To Call", variant: "primary" },
    { label: "Not Interested", stage: "3-Dead", variant: "secondary" },
    { label: "Mark as Fraud", stage: "MARK AS FROUD", variant: "destructive" },
  ],
  "Demo Booked": [
    { label: "Demo Attended", stage: "Demo Attended", variant: "primary" },
    { label: "Not Interested", stage: "3-Dead", variant: "secondary" },
    { label: "Mark as Fraud", stage: "MARK AS FROUD", variant: "destructive" },
  ],
  "Demo Attended": [
    { label: "Potential", stage: "2-Potential", variant: "primary" },
    { label: "Not Interested", stage: "3-Dead", variant: "secondary" },
    { label: "Mark as Fraud", stage: "MARK AS FROUD", variant: "destructive" },
  ],
};

type LeadTab = "THIRD_PARTY" | "APP_LOGIN" | "DEAD" | "PAID" | "NOT_INTERESTED";
type PlatformLeadVoiceNote = {
  id: string;
  content_type: string;
  byte_size: number;
  duration_ms: number;
  created_at: string;
};

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

type PlatformCampaignOption = {
  id: string;
  name: string;
  campaign_date: string;
};

function LeadEditor({
  lead,
  tickets,
  ticketsLoading,
  ticketLoadError,
  voiceNotes,
  voiceNotesLoading,
  voiceNotesError,
  voiceNoteRecording,
  voiceNoteSaving,
  voiceNoteError,
  onRecordVoiceNote,
  onStopVoiceNote,
  onReloadVoiceNotes,
  onClose,
  onSaved,
}: {
  lead: PlatformLead | null;
  tickets: LeadTicket[];
  ticketsLoading: boolean;
  ticketLoadError: string;
  voiceNotes: PlatformLeadVoiceNote[];
  voiceNotesLoading: boolean;
  voiceNotesError: string;
  voiceNoteRecording: boolean;
  voiceNoteSaving: boolean;
  voiceNoteError: string;
  onRecordVoiceNote: () => void;
  onStopVoiceNote: () => void;
  onReloadVoiceNotes: () => void;
  onClose: () => void;
  onSaved: (lead: PlatformLead, movedToThirdParty?: boolean) => void;
}) {
  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [mobile, setMobile] = useState(lead?.mobile ?? "");
  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [city, setCity] = useState(lead?.city ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [stage, setStage] = useState(lead?.stage ?? PLATFORM_LEAD_STAGES[0]);
  const [natureOfBusiness, setNatureOfBusiness] = useState(lead?.nature_of_business ?? "");
  const [quickNote, setQuickNote] = useState(lead?.quick_note ?? "");
  const [detailsTab, setDetailsTab] = useState<"quick-note" | "business" | "details" | "activity">("quick-note");
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
          body: JSON.stringify({ name, email, mobile, companyName, city, source, stage: nextStage, natureOfBusiness, quickNote }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save lead.");
      onSaved(payload.lead, movedToThirdParty);
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
          { value: "quick-note", label: "Quick Note" },
          { value: "business", label: "Nature of Business" },
          { value: "details", label: "Lead Details" },
          { value: "activity", label: "Activity & Callbacks" },
        ]}
        value={detailsTab}
        onChange={(value) => setDetailsTab(value as typeof detailsTab)}
        ariaLabel="Lead details"
      />
      <form onSubmit={submit} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {detailsTab === "quick-note" && (
          <div className="space-y-4">
            <Textarea
              label="Quick Note"
              maxLength={2000}
              rows={5}
              value={quickNote}
              onChange={(event) => setQuickNote(event.target.value)}
              placeholder="Add a note about this lead"
            />
            {lead ? (
              <section aria-label="Voice notes" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Voice notes</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant={voiceNoteRecording ? "destructive" : "secondary"}
                    disabled={voiceNoteSaving}
                    onClick={voiceNoteRecording ? onStopVoiceNote : onRecordVoiceNote}
                  >
                    {voiceNoteRecording
                      ? <Square className="h-4 w-4" aria-hidden="true" />
                      : <Mic className="h-4 w-4" aria-hidden="true" />}
                    {voiceNoteRecording ? "Finish recording" : voiceNoteSaving ? "Saving recording..." : "Record voice note"}
                  </Button>
                </div>
                {voiceNoteRecording && <p role="status" className="text-xs text-slate-600">Recording. Select Finish recording when you are done.</p>}
                {voiceNoteError && <p role="alert" className="text-sm text-red-700">{voiceNoteError}</p>}
                {voiceNotesError && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p role="alert" className="text-sm text-red-700">{voiceNotesError}</p>
                    <Button type="button" size="sm" variant="secondary" onClick={onReloadVoiceNotes}>Retry</Button>
                  </div>
                )}
                {voiceNotesLoading ? (
                  <p role="status" className="text-sm text-slate-500">Loading voice notes...</p>
                ) : voiceNotes.length > 0 ? (
                  <ul className="space-y-2">
                    {voiceNotes.map((note) => (
                      <li key={note.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">Voice note</p>
                          <span className="text-xs text-slate-500">{Math.ceil(note.duration_ms / 1000)} sec</span>
                        </div>
                        <audio
                          controls
                          preload="none"
                          className="w-full"
                          src={`/api/platform/leads/${encodeURIComponent(lead.id)}/voice-notes/${encodeURIComponent(note.id)}/audio`}
                        />
                        <p className="text-xs text-slate-500">
                          {new Date(note.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                    No voice notes yet.
                  </p>
                )}
              </section>
            ) : (
              <p className="text-sm text-slate-500">Save the lead before recording a voice note.</p>
            )}
          </div>
        )}
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
                label="Campaign date"
                value={lead?.campaign_date ? new Date(lead.campaign_date).toLocaleDateString() : "Not available"}
              />
              <LeadActivityInfo
                label="Last campaign date"
                value={lead?.last_campaign_date ? new Date(lead.last_campaign_date).toLocaleDateString() : "Not available"}
              />
              <LeadActivityInfo
                label="Last login"
                value={lead?.last_login_at ? new Date(lead.last_login_at).toLocaleString() : "Not available"}
              />
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
                    <p className="mt-1 text-xs text-slate-500">{ticket.request_type === "CALLBACK"
                      ? `Callback · ${ticket.callback_date ?? "Date not set"} ${ticket.callback_time ?? ""}`
                      : ticket.request_type === "DEMO_BOOKING"
                        ? `Demo booking · ${ticket.callback_date ?? "Date not set"} ${ticket.callback_time ?? ""}`
                        : "Support ticket"} · Created {new Date(ticket.created_at).toLocaleString()}</p>
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
  leads: initialLeads,
  appLogins,
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
    created_at: string;
    last_login_at: string;
  }>
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdFromUrl = searchParams.get("leadId");
  const [leadOverrides, setLeadOverrides] = useState<Record<string, PlatformLead>>({});
  const leads = useMemo(() => {
    const merged = initialLeads.map((lead) => leadOverrides[lead.id] ?? lead);
    const initialIds = new Set(initialLeads.map((lead) => lead.id));
    for (const [id, lead] of Object.entries(leadOverrides)) {
      if (!initialIds.has(id)) merged.push(lead);
    }
    return merged;
  }, [initialLeads, leadOverrides]);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [newLead, setNewLead] = useState(false);
  const selectedLeadId = leadIdFromUrl;
  const [leadTickets, setLeadTickets] = useState<LeadTicket[]>([]);
  const [ticketsLoadedForLeadId, setTicketsLoadedForLeadId] = useState<string | null>(null);
  const [ticketLoadFailure, setTicketLoadFailure] = useState<{ leadId: string; error: string } | null>(null);
  const [leadVoiceNotes, setLeadVoiceNotes] = useState<Record<string, PlatformLeadVoiceNote[]>>({});
  const [voiceNotesLoadedForLeadId, setVoiceNotesLoadedForLeadId] = useState<string | null>(null);
  const [voiceNotesLoadFailure, setVoiceNotesLoadFailure] = useState<{ leadId: string; error: string } | null>(null);
  const [recordingLeadId, setRecordingLeadId] = useState<string | null>(null);
  const [voiceNoteStartingLeadId, setVoiceNoteStartingLeadId] = useState<string | null>(null);
  const [voiceNoteSavingLeadId, setVoiceNoteSavingLeadId] = useState<string | null>(null);
  const [voiceNoteFailure, setVoiceNoteFailure] = useState<{ leadId: string; error: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceNoteChunksRef = useRef<Blob[]>([]);
  const voiceNoteRecordingLeadIdRef = useRef<string | null>(null);
  const voiceNoteStartedAtRef = useRef(0);
  const voiceNoteLimitTimerRef = useRef<number | null>(null);
  const [stageFilter, setStageFilter] = useState("NEED_TO_CALL");
  const [callFollowUpFilter, setCallFollowUpFilter] = useState<
    "Need To Call" | "Not Picked" | "Call Back Later"
  >("Need To Call");
  const [activeTab, setActiveTab] = useState<LeadTab>("THIRD_PARTY");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [movingSelectedLeads, setMovingSelectedLeads] = useState(false);
  const [stageMovementMessage, setStageMovementMessage] = useState("");
  const [stageMovementError, setStageMovementError] = useState("");
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [campaignOptions, setCampaignOptions] = useState<PlatformCampaignOption[]>([]);
  const [campaignOptionsLoading, setCampaignOptionsLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");
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
  const [callbackLeadId, setCallbackLeadId] = useState<string | null>(null);
  const [callbackSaving, setCallbackSaving] = useState(false);
  const [callbackError, setCallbackError] = useState("");
  const [demoBookingLeadId, setDemoBookingLeadId] = useState<string | null>(null);
  const [demoBookingDate, setDemoBookingDate] = useState("");
  const [demoBookingTime, setDemoBookingTime] = useState("");
  const [demoBookingLanguage, setDemoBookingLanguage] = useState("English");
  const [demoBookingSaving, setDemoBookingSaving] = useState(false);
  const [demoBookingError, setDemoBookingError] = useState("");
  const [visibleFields, setVisibleFields] = useState<string[]>(LEAD_FIELDS.map(({ key }) => key));
  const [uploading, setUploading] = useState(false);
  const [refreshingSheet, setRefreshingSheet] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [sheetSettingsOpen, setSheetSettingsOpen] = useState(false);
  const [savingSheetSettings, setSavingSheetSettings] = useState(false);
  const [sheetWebAppUrl, setSheetWebAppUrl] = useState(
    "https://script.google.com/macros/s/AKfycbyhCUf7BxTTnl03PVJxvGWWyhHy6PuMP9jZq2d-AHrKTyh-_w3sajIPzVA2atl2JmGLDw/exec",
  );
  const [sheetSettingsError, setSheetSettingsError] = useState("");
  const [sheetSettingsMessage, setSheetSettingsMessage] = useState("");
  const activeSelectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const ticketsLoading = Boolean(selectedLeadId && selectedLeadId !== ticketsLoadedForLeadId);
  const ticketLoadError = ticketLoadFailure?.leadId === selectedLeadId ? ticketLoadFailure.error : "";
  const voiceNotesLoading = Boolean(
    selectedLeadId
    && !leadVoiceNotes[selectedLeadId]
    && selectedLeadId !== voiceNotesLoadedForLeadId
    && voiceNotesLoadFailure?.leadId !== selectedLeadId,
  );
  const selectedVoiceNotes = selectedLeadId ? leadVoiceNotes[selectedLeadId] ?? [] : [];
  const selectedVoiceNotesError = voiceNotesLoadFailure?.leadId === selectedLeadId ? voiceNotesLoadFailure.error : "";
  const selectedVoiceNoteError = voiceNoteFailure?.leadId === selectedLeadId ? voiceNoteFailure.error : "";
  const voiceNoteRecording = recordingLeadId === selectedLeadId;
  const voiceNoteSaving = voiceNoteStartingLeadId === selectedLeadId || voiceNoteSavingLeadId === selectedLeadId;

  function applyLeadStageChanges(changes: Array<{ leadId: string; stage: string }>) {
    const updatedAt = new Date().toISOString();
    setLeadOverrides((current) => {
      const next = { ...current };
      for (const { leadId, stage } of changes) {
        const lead = next[leadId] ?? leads.find((item) => item.id === leadId);
        if (lead) next[leadId] = { ...lead, stage, updated_at: updatedAt };
      }
      return next;
    });
  }

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

  useEffect(() => {
    if (!selectedLeadId || selectedLeadId.startsWith("app-login:") || selectedLeadId === voiceNotesLoadedForLeadId) return;

    const controller = new AbortController();
    void fetch(`/api/platform/leads/${encodeURIComponent(selectedLeadId)}/voice-notes`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load voice notes.");
        setLeadVoiceNotes((current) => ({ ...current, [selectedLeadId]: payload.notes as PlatformLeadVoiceNote[] }));
        setVoiceNotesLoadFailure(null);
        setVoiceNotesLoadedForLeadId(selectedLeadId);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setVoiceNotesLoadFailure({
          leadId: selectedLeadId,
          error: error instanceof Error ? error.message : "Unable to load voice notes.",
        });
        setVoiceNotesLoadedForLeadId(selectedLeadId);
      });

    return () => controller.abort();
  }, [selectedLeadId, voiceNotesLoadedForLeadId]);

  useEffect(() => () => {
    if (voiceNoteLimitTimerRef.current !== null) window.clearTimeout(voiceNoteLimitTimerRef.current);
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }
    for (const track of mediaStreamRef.current?.getTracks() ?? []) track.stop();
  }, []);
  const filteredLeads = useMemo<PlatformLead[]>(() => {
    if (activeTab === "APP_LOGIN") {
      return appLogins.map((user) => ({
        ...user,
        id: `app-login:${user.id}`,
        nature_of_business: null,
        quick_note: null,
        campaign_date: null,
        last_campaign_date: null,
        created_at: user.created_at,
        updated_at: user.last_login_at,
        recordType: "APP_LOGIN" as const,
        workspaceUserId: user.id,
      }));
    }
    const allowedStages = activeTab === "DEAD"
      ? PLATFORM_LEAD_DEAD_STAGES
      : activeTab === "PAID"
        ? PLATFORM_LEAD_PAID_STAGES
        : activeTab === "NOT_INTERESTED"
          ? PLATFORM_LEAD_NOT_INTERESTED_STAGES
          : PLATFORM_LEAD_THIRD_PARTY_STAGES;
    return leads
      .filter((lead) => allowedStages.some((stage) => stage === lead.stage))
      .filter((lead) => {
        if (stageFilter === "NEED_TO_CALL") {
          return PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES.includes(
            lead.stage as (typeof PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES)[number],
          ) && lead.stage === callFollowUpFilter;
        }
        return stageFilter === "ALL" || lead.stage === stageFilter;
      })
      .map((lead) => ({ ...lead, recordType: "THIRD_PARTY" as const }));
  }, [activeTab, appLogins, callFollowUpFilter, leads, stageFilter]);
  const leadCountsByStage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lead of leads) {
      counts[lead.stage] = (counts[lead.stage] ?? 0) + 1;
    }
    return counts;
  }, [leads]);
  const countLeadStages = (stages: readonly string[]) =>
    stages.reduce((total, stage) => total + (leadCountsByStage[stage] ?? 0), 0);
  const stageOptions = activeTab === "DEAD"
    ? PLATFORM_LEAD_DEAD_STAGES
    : activeTab === "PAID"
      ? PLATFORM_LEAD_PAID_STAGES
      : activeTab === "NOT_INTERESTED"
        ? PLATFORM_LEAD_NOT_INTERESTED_STAGES
        : PLATFORM_LEAD_THIRD_PARTY_STAGES;
  const leadStageTabs = [
    {
      value: "ALL",
      label: "All leads",
      count: countLeadStages(PLATFORM_LEAD_THIRD_PARTY_STAGES),
    },
    { value: "1-new", step: "Stage 1", label: "New", count: leadCountsByStage["1-new"] ?? 0 },
    { value: "Verification", step: "Stage 2", label: "Verified", count: leadCountsByStage.Verification ?? 0 },
    {
      value: "NEED_TO_CALL",
      step: "Stage 3",
      label: "Need To Call",
      count: countLeadStages(PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES),
    },
    {
      value: "Interested For Demo",
      step: "Stage 4",
      label: "Interested For Demo",
      count: leadCountsByStage["Interested For Demo"] ?? 0,
    },
    { value: "Demo Booked", step: "Stage 5", label: "Demo Booked", count: leadCountsByStage["Demo Booked"] ?? 0 },
    { value: "Demo Attended", step: "Stage 6", label: "Demo Attended", count: leadCountsByStage["Demo Attended"] ?? 0 },
    { value: "2-Potential", step: "Stage 7", label: "Potential", count: leadCountsByStage["2-Potential"] ?? 0 },
  ];
  const tabs: Array<{ id: LeadTab; label: string; count: number }> = [
    {
      id: "THIRD_PARTY",
      label: "3rd Party Leads",
      count: countLeadStages(PLATFORM_LEAD_THIRD_PARTY_STAGES),
    },
    { id: "APP_LOGIN", label: "App Login", count: appLogins.length },
    {
      id: "DEAD",
      label: "Fraud Marked",
      count: countLeadStages(PLATFORM_LEAD_DEAD_STAGES),
    },
    {
      id: "PAID",
      label: "Paid",
      count: countLeadStages(PLATFORM_LEAD_PAID_STAGES),
    },
    {
      id: "NOT_INTERESTED",
      label: "Not Interested",
      count: countLeadStages(PLATFORM_LEAD_NOT_INTERESTED_STAGES),
    },
  ];
  const changeVisibleFields = useCallback((next: (string | keyof PlatformLead)[]) => {
    setVisibleFields(next.map(String));
  }, []);

  function closeEditor() {
    stopVoiceNoteRecording();
    setNewLead(false);
    window.history.pushState(null, "", "/platform/leads");
  }

  function openLead(leadId: string) {
    if (recordingLeadId && recordingLeadId !== leadId) stopVoiceNoteRecording();
    if (activeTab === "APP_LOGIN") {
      const workspaceUserId = leadId.replace(/^app-login:/, "");
      router.push(`/platform/workspace-users/${encodeURIComponent(workspaceUserId)}`);
      return;
    }
    setNewLead(false);
    window.history.pushState(null, "", `/platform/leads?leadId=${encodeURIComponent(leadId)}`);
  }

  function reloadVoiceNotes() {
    setVoiceNotesLoadFailure(null);
    setVoiceNotesLoadedForLeadId(null);
  }

  function stopVoiceNoteRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  async function startVoiceNoteRecording(leadId: string) {
    if (recordingLeadId || voiceNoteStartingLeadId || voiceNoteSavingLeadId) return;
    setVoiceNoteFailure(null);
    openLead(leadId);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceNoteFailure({ leadId, error: "Audio recording is not supported in this browser." });
      return;
    }

    setVoiceNoteStartingLeadId(leadId);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceNoteRecordingLeadIdRef.current = leadId;
      voiceNoteStartedAtRef.current = Date.now();
      voiceNoteChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceNoteChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (voiceNoteLimitTimerRef.current !== null) {
          window.clearTimeout(voiceNoteLimitTimerRef.current);
          voiceNoteLimitTimerRef.current = null;
        }
        const audioBlob = new Blob(voiceNoteChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const durationMs = Math.min(180_000, Date.now() - voiceNoteStartedAtRef.current);
        const recordedLeadId = voiceNoteRecordingLeadIdRef.current;
        for (const track of mediaStreamRef.current?.getTracks() ?? []) track.stop();
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        voiceNoteChunksRef.current = [];
        voiceNoteRecordingLeadIdRef.current = null;
        setRecordingLeadId(null);
        if (recordedLeadId) void saveVoiceNoteRecording(recordedLeadId, audioBlob, durationMs);
      };
      recorder.start(250);
      setRecordingLeadId(leadId);
      voiceNoteLimitTimerRef.current = window.setTimeout(stopVoiceNoteRecording, 180_000);
    } catch (error) {
      for (const track of mediaStreamRef.current?.getTracks() ?? []) track.stop();
      mediaStreamRef.current = null;
      setVoiceNoteFailure({
        leadId,
        error: error instanceof Error ? error.message : "Unable to access the microphone.",
      });
    } finally {
      setVoiceNoteStartingLeadId(null);
    }
  }

  async function saveVoiceNoteRecording(leadId: string, audioBlob: Blob, durationMs: number) {
    if (audioBlob.size === 0) {
      setVoiceNoteFailure({ leadId, error: "No audio was captured. Check microphone access and try again." });
      return;
    }
    if (audioBlob.size > 5 * 1024 * 1024) {
      setVoiceNoteFailure({ leadId, error: "This recording exceeds the 5 MB limit. Record a shorter note." });
      return;
    }

    setVoiceNoteSavingLeadId(leadId);
    setVoiceNoteFailure(null);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "lead-voice-note");
      formData.append("durationMs", String(Math.max(1, durationMs)));
      const response = await fetch(`/api/platform/leads/${encodeURIComponent(leadId)}/voice-notes`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save voice note.");
      const note = payload.note as PlatformLeadVoiceNote;
      setLeadVoiceNotes((current) => ({
        ...current,
        [leadId]: [note, ...(current[leadId] ?? [])],
      }));
      setVoiceNotesLoadFailure(null);
      setVoiceNotesLoadedForLeadId(leadId);
    } catch (error) {
      setVoiceNoteFailure({
        leadId,
        error: error instanceof Error ? error.message : "Unable to save voice note.",
      });
    } finally {
      setVoiceNoteSavingLeadId(null);
    }
  }

  function renderVoiceNoteAction(lead: PlatformLead) {
    const isRecording = recordingLeadId === lead.id;
    const isBusy = voiceNoteStartingLeadId === lead.id || voiceNoteSavingLeadId === lead.id;
    return (
      <Button
        type="button"
        size="sm"
        variant={isRecording ? "destructive" : "outline"}
        disabled={isBusy || (Boolean(recordingLeadId) && !isRecording)}
        onClick={() => isRecording ? stopVoiceNoteRecording() : void startVoiceNoteRecording(lead.id)}
        aria-label={isRecording ? `Finish voice note for ${lead.name}` : `Record voice note for ${lead.name}`}
        aria-pressed={isRecording}
        title={isRecording ? "Finish voice note" : "Record voice note"}
      >
        {isRecording ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
      </Button>
    );
  }

  function openNewLead() {
    setNewLead(true);
    window.history.pushState(null, "", "/platform/leads");
  }

  function openCallbackScheduler(leadId: string) {
    setCallbackLeadId(leadId);
    setCallbackDate("");
    setCallbackTime("");
    setCallbackError("");
  }

  function openDemoBooking(leadId: string) {
    setDemoBookingLeadId(leadId);
    setDemoBookingDate("");
    setDemoBookingTime("");
    setDemoBookingLanguage("English");
    setDemoBookingError("");
  }

  async function bookLeadDemo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoBookingLeadId || demoBookingSaving) return;
    const lead = leads.find((item) => item.id === demoBookingLeadId);
    if (!lead) {
      setDemoBookingError("Lead not found. Refresh the page and try again.");
      return;
    }

    setDemoBookingSaving(true);
    setDemoBookingError("");
    try {
      const response = await fetch(`/api/platform/leads/${encodeURIComponent(lead.id)}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Demo booking · ${lead.name}`,
          description: `Product demo booked for ${demoBookingDate} at ${demoBookingTime}. Demo language: ${demoBookingLanguage}.`,
          requestType: "DEMO_BOOKING",
          callbackDate: demoBookingDate,
          callbackTime: demoBookingTime,
          markDemoBooked: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to book the demo.");
      applyLeadStageChanges([{ leadId: lead.id, stage: "Demo Booked" }]);
      setStageMovementMessage(`Demo booked for ${lead.name} on ${demoBookingDate} at ${demoBookingTime}.`);
      setDemoBookingLeadId(null);
    } catch (error) {
      setDemoBookingError(error instanceof Error ? error.message : "Unable to book the demo.");
    } finally {
      setDemoBookingSaving(false);
    }
  }

  async function scheduleLeadCallback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!callbackLeadId || callbackSaving) return;
    const lead = leads.find((item) => item.id === callbackLeadId);
    if (!lead) {
      setCallbackError("Lead not found. Refresh the page and try again.");
      return;
    }

    setCallbackSaving(true);
    setCallbackError("");
    try {
      const response = await fetch(`/api/platform/leads/${encodeURIComponent(lead.id)}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Callback · ${lead.name}`,
          description: `Call back later. Scheduled for ${callbackDate} at ${callbackTime}.`,
          requestType: "CALLBACK",
          callbackDate,
          callbackTime,
          markCallBackLater: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to schedule the callback.");
      applyLeadStageChanges([{ leadId: lead.id, stage: "Call Back Later" }]);
      setStageMovementMessage(`Callback scheduled for ${lead.name} on ${callbackDate} at ${callbackTime}.`);
      setCallbackLeadId(null);
      setCallbackDate("");
      setCallbackTime("");
      router.refresh();
    } catch (error) {
      setCallbackError(error instanceof Error ? error.message : "Unable to schedule the callback.");
    } finally {
      setCallbackSaving(false);
    }
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
      setLeadOverrides((current) => ({
        ...current,
        [lead.id]: { ...lead, ...payload.lead, recordType: "THIRD_PARTY" },
      }));
      setStatusLeadId(null);
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
      applyLeadStageChanges(selectedLeadIds.flatMap((leadId) => {
        const lead = leads.find((item) => item.id === leadId);
        if (!lead) return [];
        const currentIndex = PLATFORM_LEAD_THIRD_PARTY_STAGES.indexOf(
          lead.stage as (typeof PLATFORM_LEAD_THIRD_PARTY_STAGES)[number],
        );
        const nextStage = PLATFORM_LEAD_THIRD_PARTY_STAGES[
          currentIndex + (direction === "NEXT" ? 1 : -1)
        ];
        return nextStage ? [{ leadId, stage: nextStage }] : [];
      }));
      setStageMovementMessage(
        `${payload.updatedCount} lead${payload.updatedCount === 1 ? "" : "s"} moved${payload.skippedCount ? `; ${payload.skippedCount} at a status boundary were unchanged` : ""}.`,
      );
      setSelectedLeadIds([]);
    } catch (error) {
      setStageMovementError(error instanceof Error ? error.message : "Unable to move lead statuses.");
    } finally {
      setMovingSelectedLeads(false);
    }
  }

  async function updateNewLeadStage(
    stage: "Verification" | "MARK AS FROUD",
    leadIds: string[] = selectedLeadIds,
  ) {
    if (leadIds.length === 0 || movingSelectedLeads) return;
    setMovingSelectedLeads(true);
    setStageMovementMessage("");
    setStageMovementError("");
    try {
      const response = await fetch("/api/platform/leads/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, newLeadStage: stage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update new leads.");
      applyLeadStageChanges(leadIds.map((leadId) => ({ leadId, stage })));
      setStageMovementMessage(
        `${payload.updatedCount} lead${payload.updatedCount === 1 ? "" : "s"} ${stage === "Verification" ? "approved and moved to Verified" : "moved to Mark as Fraud"}.`,
      );
      setSelectedLeadIds([]);
    } catch (error) {
      setStageMovementError(error instanceof Error ? error.message : "Unable to update new leads.");
    } finally {
      setMovingSelectedLeads(false);
    }
  }

  async function updateSelectedLeadStage(stageOverride?: string, leadIds: string[] = selectedLeadIds) {
    const nextStage = stageOverride ?? bulkTargetStage;
    if (leadIds.length === 0 || movingSelectedLeads || !nextStage) return;
    setMovingSelectedLeads(true);
    setStageMovementMessage("");
    setStageMovementError("");
    try {
      const response = await fetch("/api/platform/leads/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, stage: nextStage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update lead stages.");
      applyLeadStageChanges(leadIds.map((leadId) => ({ leadId, stage: nextStage })));
      setStageMovementMessage(
        `${payload.updatedCount} lead${payload.updatedCount === 1 ? "" : "s"} changed to ${nextStage}${payload.unchangedCount ? `; ${payload.unchangedCount} already had this stage` : ""}.`,
      );
      setSelectedLeadIds([]);
      setBulkStageDialogOpen(false);
      setBulkTargetStage("");
    } catch (error) {
      setStageMovementError(error instanceof Error ? error.message : "Unable to update lead stages.");
    } finally {
      setMovingSelectedLeads(false);
    }
  }

  function handleSaved(lead: PlatformLead, movedToThirdParty = false) {
    const existingLead = leads.find((item) => item.id === lead.id);
    setLeadOverrides((current) => ({
      ...current,
      [lead.id]: {
        ...existingLead,
        ...lead,
        campaign_date: lead.campaign_date ?? existingLead?.campaign_date ?? null,
        last_campaign_date: lead.last_campaign_date ?? existingLead?.last_campaign_date ?? null,
        recordType: "THIRD_PARTY",
      },
    }));
    setNewLead(false);
    if (movedToThirdParty) {
      setActiveTab("THIRD_PARTY");
      setStageFilter("ALL");
    }
    window.history.pushState(null, "", `/platform/leads?leadId=${encodeURIComponent(lead.id)}`);
  }

  async function openCampaignDialog() {
    setCampaignDialogOpen(true);
    setCampaignOptions([]);
    setCampaignError("");
    setCampaignMessage("");
    setCampaignOptionsLoading(true);
    try {
      const response = await fetch("/api/platform/campaigns");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load campaigns.");
      const options = payload.campaigns as PlatformCampaignOption[];
      setCampaignOptions(options);
      setSelectedCampaignId((current) =>
        options.some((campaign) => campaign.id === current)
          ? current
          : options[0]?.id ?? "",
      );
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Unable to load campaigns.");
    } finally {
      setCampaignOptionsLoading(false);
    }
  }

  async function addSelectedLeadsToCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId || selectedLeadIds.length === 0 || addingToCampaign) return;
    setAddingToCampaign(true);
    setCampaignError("");
    try {
      const response = await fetch(`/api/platform/campaigns/${encodeURIComponent(selectedCampaignId)}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to add leads to campaign.");
      const { addedCount, alreadyAddedCount } = payload as {
        addedCount: number;
        alreadyAddedCount: number;
      };
      setCampaignMessage(
        `${addedCount} lead${addedCount === 1 ? "" : "s"} added to the campaign${alreadyAddedCount ? `; ${alreadyAddedCount} already assigned` : ""}.`,
      );
      setSelectedLeadIds([]);
      setLeadOverrides({});
      setCampaignDialogOpen(false);
      router.refresh();
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Unable to add leads to campaign.");
    } finally {
      setAddingToCampaign(false);
    }
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

  async function refreshGoogleSheet() {
    if (refreshingSheet || uploading) return;
    setRefreshingSheet(true);
    setUploadMessage("");
    setUploadError("");
    try {
      const webAppUrl = window.localStorage.getItem("platform-google-sheets-leads-url") || sheetWebAppUrl;
      const response = await fetch("/api/platform/leads/google-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webAppUrl }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to sync Google Sheets leads.");
      const { imported, skippedDuplicates } = payload as {
        imported: number;
        skippedDuplicates: number;
      };
      setUploadMessage(
        `${imported} new lead${imported === 1 ? "" : "s"} imported; ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? "" : "s"} skipped.`,
      );
      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to sync Google Sheets leads.");
    } finally {
      setRefreshingSheet(false);
    }
  }

  async function openGoogleSheetSettings() {
    setSheetSettingsOpen(true);
    setSheetSettingsError("");
    setSheetSettingsMessage("");
    const savedUrl = window.localStorage.getItem("platform-google-sheets-leads-url");
    if (savedUrl) setSheetWebAppUrl(savedUrl);
  }

  async function saveAndTestGoogleSheetSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingSheetSettings) return;
    setSavingSheetSettings(true);
    setSheetSettingsError("");
    setSheetSettingsMessage("");
    try {
      const response = await fetch("/api/platform/leads/google-sheets/configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webAppUrl: sheetWebAppUrl }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save and test Google Sheets settings.");
      window.localStorage.setItem("platform-google-sheets-leads-url", sheetWebAppUrl.trim());
      setSheetSettingsMessage(`Connection successful. ${payload.availableLeads} lead rows are available to sync.`);
    } catch (error) {
      setSheetSettingsError(error instanceof Error ? error.message : "Unable to save and test Google Sheets settings.");
    } finally {
      setSavingSheetSettings(false);
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
              setCallFollowUpFilter("Need To Call");
              setSelectedLeadIds([]);
              setNewLead(false);
              window.history.pushState(null, "", "/platform/leads");
            }}
            ariaLabel="Lead categories"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-xs text-slate-500">{filteredLeads.length} records</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={refreshingSheet || uploading}
            onClick={() => void refreshGoogleSheet()}
            title={refreshingSheet ? "Refreshing Google Sheets leads" : "Refresh leads from Google Sheets"}
          >
            <RefreshCw className={`h-4 w-4 ${refreshingSheet ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshingSheet ? "Refreshing..." : "Refresh Sheet"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={refreshingSheet || uploading}
            onClick={() => void openGoogleSheetSettings()}
            aria-label="Configure Google Sheets connection"
            title="Google Sheets connection settings"
            className="min-h-0 px-2 py-1.5"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </Button>
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

      <Modal
        open={sheetSettingsOpen}
        onClose={() => {
          if (!savingSheetSettings) setSheetSettingsOpen(false);
        }}
        ariaLabelledBy="google-sheets-settings-title"
        size="md"
        closeOnBackdrop={!savingSheetSettings}
      >
        <form onSubmit={saveAndTestGoogleSheetSettings} className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="google-sheets-settings-title" className="text-lg font-semibold text-slate-900">
                Google Sheets
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSheetSettingsOpen(false)}
              disabled={savingSheetSettings}
              aria-label="Close Google Sheets settings"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <Input
            label="Web-app URL"
            type="url"
            required
            maxLength={2048}
            textCase="preserve"
            value={sheetWebAppUrl}
            onChange={(event) => setSheetWebAppUrl(event.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            hint="Paste the URL ending in /exec."
          />
          {sheetSettingsError && <p role="alert" className="text-sm text-red-700">{sheetSettingsError}</p>}
          {sheetSettingsMessage && (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {sheetSettingsMessage}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSheetSettingsOpen(false)} disabled={savingSheetSettings}>
              Close
            </Button>
            <Button type="submit" disabled={savingSheetSettings}>
              {savingSheetSettings && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {savingSheetSettings ? "Testing..." : "Test and save"}
            </Button>
          </div>
        </form>
      </Modal>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {activeTab === "THIRD_PARTY" && (
            <Tabs
              tabs={leadStageTabs.map((tab) => ({
                value: tab.value,
                label: (
                  <>
                    {"step" in tab && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--erp-brand)]">
                        {tab.step}
                      </span>
                    )}
                    <span className="text-sm leading-tight">{tab.label}</span>
                    <span className="text-xs font-medium tabular-nums text-slate-500">
                      {tab.count}
                    </span>
                  </>
                ),
              }))}
              value={stageFilter}
              onChange={(value) => {
                setStageFilter(value);
                setCallFollowUpFilter("Need To Call");
                setSelectedLeadIds([]);
              }}
              ariaLabel="Filter leads by stage"
              cardStyle
            />
          )}
          {activeTab !== "APP_LOGIN" && activeTab !== "THIRD_PARTY" && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter leads by status">
              <Button
                type="button"
                size="sm"
                variant={stageFilter === "ALL" ? "primary" : "secondary"}
                aria-pressed={stageFilter === "ALL"}
                onClick={() => {
                  setStageFilter("ALL");
                  setCallFollowUpFilter("Need To Call");
                  setSelectedLeadIds([]);
                }}
              >
                All
              </Button>
              {stageOptions
                .filter((stage) =>
                  stage !== "Not Picked" && stage !== "Call Back Later",
                )
                .map((stage) => (
                  <Button
                    key={stage}
                    type="button"
                    size="sm"
                    variant={
                      stageFilter === (stage === "Need To Call" ? "NEED_TO_CALL" : stage)
                        ? "primary"
                        : "secondary"
                    }
                    aria-pressed={stageFilter === (stage === "Need To Call" ? "NEED_TO_CALL" : stage)}
                    onClick={() => {
                      setStageFilter(stage === "Need To Call" ? "NEED_TO_CALL" : stage);
                      setCallFollowUpFilter("Need To Call");
                      setSelectedLeadIds([]);
                    }}
                  >
                    {stage === "1-new" ? "New" : stage === "Verification" ? "Verified" : stage === "2-Potential" ? "Potential" : stage}
                    <span className="text-[10px] opacity-75">
                      ({stage === "Need To Call"
                        ? countLeadStages(PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES)
                        : leadCountsByStage[stage] ?? 0})
                    </span>
                  </Button>
                ))}
            </div>
          )}
          {activeTab === "THIRD_PARTY" && stageFilter === "NEED_TO_CALL" && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Need To Call statuses">
              {PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES.map((stage) => (
                <Button
                  key={stage}
                  type="button"
                  size="sm"
                  variant={callFollowUpFilter === stage ? "primary" : "secondary"}
                  aria-pressed={callFollowUpFilter === stage}
                  onClick={() => {
                    setCallFollowUpFilter(stage);
                    setSelectedLeadIds([]);
                  }}
                >
                  {stage}
                  <span className="text-[10px] opacity-75">({leadCountsByStage[stage] ?? 0})</span>
                </Button>
              ))}
            </div>
          )}
          <ReportGrid
            title={tabs.find((tab) => tab.id === activeTab)?.label ?? "Leads"}
            records={filteredLeads}
            fields={LEAD_FIELDS}
            visibleFields={visibleFields}
            onVisibleFieldsChange={changeVisibleFields}
            storageKey="platform-leads-report-columns-v2"
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
                  variant="primary"
                  size="sm"
                  disabled={selectedLeadIds.length === 0 || movingSelectedLeads || addingToCampaign}
                  onClick={() => void openCampaignDialog()}
                  title="Add selected leads to a campaign"
                  className="h-7 px-2 text-[11px]"
                >
                  Add to campaign{selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ""}
                </Button>
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
                {stageFilter === "1-new" ? null : stageFilter === "NEED_TO_CALL" || PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES.includes(
                  stageFilter as (typeof PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES)[number],
                ) ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={selectedLeadIds.length === 0 || movingSelectedLeads}
                      onClick={() => void updateSelectedLeadStage("Interested For Demo")}
                      title="Mark selected leads as interested"
                      className="h-7 px-2 text-[11px]"
                    >
                      Mark interested{selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ""}
                    </Button>
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
            rowActions={(lead) => {
              if (lead.recordType === "APP_LOGIN") return null;
              if (lead.stage === "1-new") {
                return (
                  <>
                    {renderVoiceNoteAction(lead)}
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateNewLeadStage("Verification", [lead.id])}
                      aria-label={`Move ${lead.name} to Verified`}
                    >
                      Verified
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateNewLeadStage("MARK AS FROUD", [lead.id])}
                      aria-label={`Mark ${lead.name} as fraud`}
                    >
                      Mark as Fraud
                    </Button>
                  </>
                );
              }
              const stageActions = LEAD_ROW_STAGE_ACTIONS[lead.stage];
              if (stageActions) {
                return (
                  <>
                    {renderVoiceNoteAction(lead)}
                    {stageActions.map((action) => (
                      <Button
                        key={action.stage}
                        type="button"
                        size="sm"
                        variant={action.variant}
                        disabled={movingSelectedLeads}
                        onClick={() => void updateSelectedLeadStage(action.stage, [lead.id])}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </>
                );
              }
              if (lead.stage === "Interested For Demo") {
                return (
                  <>
                    {renderVoiceNoteAction(lead)}
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={movingSelectedLeads || demoBookingSaving}
                      onClick={() => openDemoBooking(lead.id)}
                    >
                      Book Demo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateSelectedLeadStage("3-Dead", [lead.id])}
                    >
                      Not Interested
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateSelectedLeadStage("MARK AS FROUD", [lead.id])}
                    >
                      Mark as Fraud
                    </Button>
                  </>
                );
              }
              if (PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES.includes(
                lead.stage as (typeof PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES)[number],
              )) {
                return (
                  <>
                    {renderVoiceNoteAction(lead)}
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateSelectedLeadStage("Need To Call", [lead.id])}
                    >
                      Need To Call
                    </Button>
                    {lead.stage === "Need To Call" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={movingSelectedLeads}
                        onClick={() => void updateSelectedLeadStage("Interested For Demo", [lead.id])}
                      >
                        Interested For Demo
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateSelectedLeadStage("Not Picked", [lead.id])}
                    >
                      Not Picked
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateSelectedLeadStage("MARK AS FROUD", [lead.id])}
                    >
                      Mark as Fraud
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={callbackSaving}
                      onClick={() => openCallbackScheduler(lead.id)}
                    >
                      Call Back Later
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={movingSelectedLeads}
                      onClick={() => void updateSelectedLeadStage("3-Dead", [lead.id])}
                    >
                      Not Interested
                    </Button>
                  </>
                );
              }
              return renderVoiceNoteAction(lead);
            }}
            onNewOrder={activeTab === "THIRD_PARTY" ? openNewLead : undefined}
            newActionLabel="Add lead"
            emptyMessage={activeTab === "APP_LOGIN" ? "No workspace accounts have logged in yet." : "No leads match this category."}
            renderCell={(fieldKey, lead) => {
              if (fieldKey === "created_at") {
                return lead.created_at
                  ? new Date(lead.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                  : "—";
              }
              return lead[fieldKey as keyof PlatformLead] || "—";
            }}
          />
          {stageMovementMessage && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{stageMovementMessage}</p>}
          {stageMovementError && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{stageMovementError}</p>}
          {campaignMessage && <p role="status" className="mt-2 rounded-lg border border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] px-3 py-2 text-xs text-[var(--erp-brand)]">{campaignMessage}</p>}
        </div>
        {activeTab !== "APP_LOGIN" && (newLead || activeSelectedLead) && (
          <LeadEditor
            key={newLead ? "new-lead" : activeSelectedLead?.id}
            lead={newLead ? null : activeSelectedLead}
            tickets={newLead ? [] : selectedLeadId === ticketsLoadedForLeadId ? leadTickets : []}
            ticketsLoading={ticketsLoading}
            ticketLoadError={ticketLoadError}
            voiceNotes={selectedVoiceNotes}
            voiceNotesLoading={voiceNotesLoading}
            voiceNotesError={selectedVoiceNotesError}
            voiceNoteRecording={voiceNoteRecording}
            voiceNoteSaving={voiceNoteSaving}
            voiceNoteError={selectedVoiceNoteError}
            onRecordVoiceNote={() => {
              if (selectedLeadId) void startVoiceNoteRecording(selectedLeadId);
            }}
            onStopVoiceNote={stopVoiceNoteRecording}
            onReloadVoiceNotes={reloadVoiceNotes}
            onClose={closeEditor}
            onSaved={handleSaved}
          />
        )}
      </div>
      <Modal
        open={campaignDialogOpen}
        onClose={() => {
          if (!addingToCampaign) {
            setCampaignDialogOpen(false);
            setCampaignError("");
          }
        }}
        ariaLabel="Add selected leads to a campaign"
        ariaLabelledBy="add-leads-to-campaign-title"
        size="sm"
      >
        <form onSubmit={addSelectedLeadsToCampaign} className="space-y-4 p-5">
          <div>
            <h2 id="add-leads-to-campaign-title" className="text-lg font-bold text-slate-900">
              Add {selectedLeadIds.length} selected lead{selectedLeadIds.length === 1 ? "" : "s"} to campaign
            </h2>
            <p className="mt-1 text-sm text-slate-600">Customer details and stage will be shown in the campaign.</p>
          </div>
          {campaignOptionsLoading ? (
            <p role="status" className="text-sm text-slate-600">Loading campaigns…</p>
          ) : campaignOptions.length > 0 ? (
            <Select
              label="Campaign"
              required
              value={selectedCampaignId}
              disabled={addingToCampaign}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
              options={campaignOptions.map((campaign) => ({
                label: `${campaign.name} · ${new Date(campaign.campaign_date).toLocaleDateString()}`,
                value: campaign.id,
              }))}
            />
          ) : !campaignError ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-slate-700">Create a campaign before adding these leads.</p>
              <Button type="button" variant="secondary" onClick={() => router.push("/platform/campaigns")}>
                Open Campaigns
              </Button>
            </div>
          ) : null}
          {campaignError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{campaignError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={addingToCampaign}
              onClick={() => setCampaignDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={addingToCampaign || campaignOptionsLoading || !selectedCampaignId}
            >
              {addingToCampaign ? "Adding…" : "Add to campaign"}
            </Button>
          </div>
        </form>
      </Modal>
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
        open={Boolean(demoBookingLeadId)}
        onClose={() => {
          if (!demoBookingSaving) {
            setDemoBookingLeadId(null);
            setDemoBookingError("");
          }
        }}
        ariaLabel="Book a demo"
        ariaLabelledBy="lead-demo-booking-title"
        size="square"
      >
        <form onSubmit={bookLeadDemo} className="space-y-4 p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Lead appointment</p>
            <h2 id="lead-demo-booking-title" className="mt-1 text-lg font-bold text-slate-900">
              Book Demo{demoBookingLeadId ? ` · ${leads.find((lead) => lead.id === demoBookingLeadId)?.name ?? ""}` : ""}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Demo date"
              required
              type="date"
              min={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}
              value={demoBookingDate}
              disabled={demoBookingSaving}
              onChange={(event) => setDemoBookingDate(event.target.value)}
            />
            <Input
              label="Demo time"
              required
              type="time"
              value={demoBookingTime}
              disabled={demoBookingSaving}
              onChange={(event) => setDemoBookingTime(event.target.value)}
            />
          </div>
          <Select
            label="Demo language"
            required
            value={demoBookingLanguage}
            disabled={demoBookingSaving}
            onChange={(event) => setDemoBookingLanguage(event.target.value)}
            options={[
              { label: "English", value: "English" },
              { label: "Hindi", value: "Hindi" },
            ]}
          />
          {demoBookingError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{demoBookingError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setDemoBookingLeadId(null)} disabled={demoBookingSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={demoBookingSaving || !demoBookingDate || !demoBookingTime}>
              {demoBookingSaving ? "Booking..." : "Confirm demo"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(callbackLeadId)}
        onClose={() => {
          if (!callbackSaving) {
            setCallbackLeadId(null);
            setCallbackError("");
          }
        }}
        ariaLabel="Schedule lead callback"
        ariaLabelledBy="lead-callback-title"
        size="sm"
      >
        <form onSubmit={scheduleLeadCallback} className="space-y-4 p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Lead follow-up</p>
            <h2 id="lead-callback-title" className="mt-1 text-lg font-bold text-slate-900">
              Call Back Later{callbackLeadId ? ` · ${leads.find((lead) => lead.id === callbackLeadId)?.name ?? ""}` : ""}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Callback date"
              required
              type="date"
              value={callbackDate}
              disabled={callbackSaving}
              onChange={(event) => setCallbackDate(event.target.value)}
            />
            <Input
              label="Callback time"
              required
              type="time"
              value={callbackTime}
              disabled={callbackSaving}
              onChange={(event) => setCallbackTime(event.target.value)}
            />
          </div>
          {callbackError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{callbackError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={callbackSaving}
              onClick={() => setCallbackLeadId(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={callbackSaving || !callbackDate || !callbackTime}>
              {callbackSaving ? "Scheduling…" : "Schedule callback"}
            </Button>
          </div>
        </form>
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
