"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";

type PlatformCampaignSummary = {
  id: string;
  name: string;
  campaign_date: string;
  created_at: string;
  lead_count: number;
  can_cancel: boolean;
  can_delete: boolean;
  action_block_reason: string | null;
};

type PlatformCampaignDetail = {
  id: string;
  name: string;
  campaign_date: string;
  leads: Array<{
    added_at: string;
    lead: {
      id: string;
      name: string;
      mobile: string | null;
      company_name: string | null;
      city: string | null;
      stage: string;
    };
  }>;
};

type CampaignWhatsAppTemplate = {
  id: string;
  templateName: string;
};

const CAMPAIGN_FIELDS = [
  { key: "name", label: "Campaign" },
  { key: "campaign_date", label: "Campaign date" },
  { key: "lead_count", label: "Leads" },
  { key: "actions", label: "Actions" },
];

type CampaignAction = {
  id: string;
  name: string;
  action: "cancel" | "delete";
};

const CAMPAIGN_LEAD_FIELDS = [
  { key: "name", label: "Customer name" },
  { key: "mobile", label: "Mobile number" },
  { key: "company_name", label: "Company name" },
  { key: "city", label: "City" },
  { key: "stage", label: "Stage" },
  { key: "added_at", label: "Added date" },
  { key: "actions", label: "Actions" },
];

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function todayLocalDate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function defaultScheduleDateTime() {
  const value = new Date(Date.now() + 5 * 60_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

export default function PlatformCampaignsPage({
  campaigns: initialCampaigns,
}: {
  campaigns: PlatformCampaignSummary[];
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedCampaign, setSelectedCampaign] = useState<PlatformCampaignDetail | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDate, setCampaignDate] = useState(todayLocalDate);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [leadToRemove, setLeadToRemove] = useState<{ id: string; name: string } | null>(null);
  const [removingLead, setRemovingLead] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [messageTemplates, setMessageTemplates] = useState<CampaignWhatsAppTemplate[]>([]);
  const [scheduleTarget, setScheduleTarget] = useState<PlatformCampaignSummary | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleDateTime);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [schedulingMessage, setSchedulingMessage] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [campaignAction, setCampaignAction] = useState<CampaignAction | null>(null);
  const [campaignActionError, setCampaignActionError] = useState("");
  const [savingCampaignAction, setSavingCampaignAction] = useState(false);

  async function openCampaign(campaignId: string) {
    setSelectedCampaign(null);
    setCampaignError("");
    setLoadingCampaign(true);
    try {
      const campaignResponse = await fetch(`/api/platform/campaigns/${encodeURIComponent(campaignId)}`);
      const campaignPayload = await campaignResponse.json();
      if (!campaignResponse.ok) throw new Error(campaignPayload.error || "Unable to load campaign.");
      setSelectedCampaign(campaignPayload.campaign as PlatformCampaignDetail);
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Unable to load campaign.");
    } finally {
      setLoadingCampaign(false);
    }
  }

  async function scheduleCampaignMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleTarget || schedulingMessage) return;
    setSchedulingMessage(true);
    setMessageError("");
    try {
      const response = await fetch(
        `/api/platform/campaigns/${encodeURIComponent(scheduleTarget.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: selectedTemplateId,
            scheduledAt: new Date(scheduledAt).toISOString(),
            consentConfirmed,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to schedule WhatsApp campaign.");
      setConsentConfirmed(false);
      setScheduledAt(defaultScheduleDateTime());
      setCampaigns((current) => current.map((campaign) =>
        campaign.id === scheduleTarget.id
          ? { ...campaign, can_cancel: true, action_block_reason: null }
          : campaign,
      ));
      setScheduleTarget(null);
      router.refresh();
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Unable to schedule WhatsApp campaign.");
    } finally {
      setSchedulingMessage(false);
    }
  }

  async function openScheduleDialog(campaign: PlatformCampaignSummary) {
    setScheduleTarget(campaign);
    setMessageError("");
    setConsentConfirmed(false);
    setScheduledAt(defaultScheduleDateTime());
    setLoadingTemplates(true);
    try {
      const response = await fetch("/api/platform/whatsapp/templates?activeOnly=true");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load active WhatsApp templates.");
      const templates = (payload.templates as Array<Record<string, unknown>>).map((template) => ({
        id: String(template.id),
        templateName: String(template.template_name),
      }));
      setMessageTemplates(templates);
      setSelectedTemplateId(String(templates[0]?.id ?? ""));
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Unable to load active WhatsApp templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/platform/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: campaignName, campaignDate }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create campaign.");
      const created = payload.campaign as Omit<PlatformCampaignSummary, "lead_count" | "can_cancel" | "can_delete" | "action_block_reason">;
      const summary: PlatformCampaignSummary = {
        ...created,
        lead_count: 0,
        can_cancel: false,
        can_delete: true,
        action_block_reason: "There are no scheduled messages to cancel.",
      };
      setCampaigns((current) =>
        [summary, ...current.filter((campaign) => campaign.id !== summary.id)]
          .sort((left, right) => right.campaign_date.localeCompare(left.campaign_date)),
      );
      setSelectedCampaign({ ...created, leads: [] });
      setCreateOpen(false);
      setCampaignName("");
      setCampaignDate(todayLocalDate());
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to create campaign.");
    } finally {
      setSaving(false);
    }
  }

  async function performCampaignAction() {
    if (!campaignAction || savingCampaignAction) return;
    setSavingCampaignAction(true);
    setCampaignActionError("");
    try {
      const url = `/api/platform/campaigns/${encodeURIComponent(campaignAction.id)}${
        campaignAction.action === "cancel" ? "/cancel" : ""
      }`;
      const response = await fetch(url, {
        method: campaignAction.action === "cancel" ? "POST" : "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update campaign.");

      if (campaignAction.action === "delete") {
        setCampaigns((current) => current.filter(({ id }) => id !== campaignAction.id));
        if (selectedCampaign?.id === campaignAction.id) {
          setSelectedCampaign(null);
        }
      } else {
        setCampaigns((current) => current.map((campaign) =>
          campaign.id === campaignAction.id
            ? { ...campaign, can_cancel: false, action_block_reason: "There are no scheduled messages to cancel." }
            : campaign,
        ));
      }
      setCampaignAction(null);
      router.refresh();
    } catch (error) {
      setCampaignActionError(error instanceof Error ? error.message : "Unable to update campaign.");
    } finally {
      setSavingCampaignAction(false);
    }
  }

  async function removeLeadFromCampaign() {
    if (!selectedCampaign || !leadToRemove || removingLead) return;
    setRemovingLead(true);
    setRemoveError("");
    try {
      const response = await fetch(
        `/api/platform/campaigns/${encodeURIComponent(selectedCampaign.id)}/leads/${encodeURIComponent(leadToRemove.id)}`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to remove lead from campaign.");

      setSelectedCampaign((current) => current && ({
        ...current,
        leads: current.leads.filter(({ lead }) => lead.id !== leadToRemove.id),
      }));
      setCampaigns((current) => current.map((campaign) =>
        campaign.id === selectedCampaign.id
          ? { ...campaign, lead_count: Math.max(0, campaign.lead_count - 1) }
          : campaign,
      ));
      setLeadToRemove(null);
      router.refresh();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Unable to remove lead from campaign.");
    } finally {
      setRemovingLead(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-600">Create campaigns and review the leads assigned to them.</p>
        </div>
        <Button type="button" variant="primary" onClick={() => {
          setSaveError("");
          setCreateOpen(true);
        }}>
          New campaign
        </Button>
      </header>

      <ReportGrid
        title="Campaigns"
        records={campaigns}
        fields={CAMPAIGN_FIELDS}
        visibleFields={CAMPAIGN_FIELDS.map(({ key }) => key)}
        onVisibleFieldsChange={() => undefined}
        rowIdSelector={(campaign) => campaign.id}
        selectedIds={selectedCampaign ? [selectedCampaign.id] : []}
        selectable={false}
        onRowClick={(campaignId) => void openCampaign(campaignId)}
        renderCell={(fieldKey, campaign) => {
          if (fieldKey === "campaign_date") return formatDate(campaign.campaign_date);
          if (fieldKey === "lead_count") return campaign.lead_count;
          if (fieldKey === "actions") {
            return (
              <div className="flex min-w-max items-center gap-2" onClick={(event) => event.stopPropagation()}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={campaign.lead_count === 0}
                  title={campaign.lead_count === 0 ? "Add leads before scheduling a campaign message" : undefined}
                  aria-label={`Schedule WhatsApp campaign message for ${campaign.name}`}
                  onClick={() => void openScheduleDialog(campaign)}
                >
                  Schedule
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label={`Open WhatsApp send history for ${campaign.name}`}
                  onClick={() => router.push(`/platform/campaigns/${encodeURIComponent(campaign.id)}/whatsapp-history`)}
                >
                  WhatsApp send history
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={!campaign.can_cancel}
                  title={campaign.can_cancel ? "Cancel scheduled messages" : campaign.action_block_reason ?? "No scheduled messages to cancel."}
                  aria-label={`Cancel scheduled messages for ${campaign.name}`}
                  onClick={() => {
                    setCampaignActionError("");
                    setCampaignAction({ id: campaign.id, name: campaign.name, action: "cancel" });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={!campaign.can_delete}
                  title={campaign.can_delete ? "Delete campaign" : campaign.action_block_reason ?? undefined}
                  aria-label={`Delete campaign ${campaign.name}`}
                  onClick={() => {
                    setCampaignActionError("");
                    setCampaignAction({ id: campaign.id, name: campaign.name, action: "delete" });
                  }}
                >
                  Delete
                </Button>
                {!campaign.can_cancel && campaign.action_block_reason && (
                  <span className="max-w-64 text-xs text-slate-600">{campaign.action_block_reason}</span>
                )}
              </div>
            );
          }
          return campaign.name;
        }}
        emptyMessage="No campaigns yet. Create a campaign to get started."
      />

      {loadingCampaign && <p role="status" className="text-sm text-slate-600">Loading campaign…</p>}
      {campaignError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{campaignError}</p>}
      {selectedCampaign && (
        <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">{selectedCampaign.name}</h2>
              <p className="mt-1 text-sm text-slate-600">Campaign date: {formatDate(selectedCampaign.campaign_date)}</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => router.push("/platform/leads")}>
              Select leads
            </Button>
          </div>
          <ReportGrid
            title="Campaign leads"
            records={selectedCampaign.leads.map(({ lead, added_at }) => ({ ...lead, added_at }))}
            fields={CAMPAIGN_LEAD_FIELDS}
            visibleFields={CAMPAIGN_LEAD_FIELDS.map(({ key }) => key)}
            onVisibleFieldsChange={() => undefined}
            rowIdSelector={(lead) => lead.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={() => undefined}
            renderCell={(fieldKey, lead) => {
              if (fieldKey === "added_at") return formatDate(lead.added_at);
              if (fieldKey === "actions") {
                return (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={`Remove ${lead.name} from ${selectedCampaign.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setRemoveError("");
                      setLeadToRemove({ id: lead.id, name: lead.name });
                    }}
                  >
                    Remove
                  </Button>
                );
              }
              return lead[fieldKey as keyof typeof lead] || "—";
            }}
            emptyMessage="No leads have been added to this campaign."
          />
        </section>
      )}

      <Modal
        open={Boolean(scheduleTarget)}
        onClose={() => {
          if (!schedulingMessage && !loadingTemplates) {
            setScheduleTarget(null);
            setMessageError("");
          }
        }}
        ariaLabel="Schedule WhatsApp campaign message"
        ariaLabelledBy="schedule-whatsapp-campaign-title"
        size="md"
      >
        <form onSubmit={scheduleCampaignMessage} className="space-y-4 p-5">
          <div>
            <h2 id="schedule-whatsapp-campaign-title" className="text-lg font-bold text-slate-900">
              Schedule WhatsApp campaign
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {scheduleTarget?.name} · {scheduleTarget?.lead_count ?? 0} leads
            </p>
          </div>
          <Select
            label="Approved MSG91 template"
            required
            value={selectedTemplateId}
            disabled={loadingTemplates || schedulingMessage || !messageTemplates.length}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            options={[
              { label: loadingTemplates ? "Loading templates…" : "Select an active template", value: "" },
              ...messageTemplates.map((template) => ({
                label: template.templateName,
                value: template.id,
              })),
            ]}
          />
          <Input
            label="Schedule date and time"
            type="datetime-local"
            required
            value={scheduledAt}
            disabled={schedulingMessage}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
          <Checkbox
            checked={consentConfirmed}
            disabled={schedulingMessage}
            onChange={(event) => setConsentConfirmed(event.target.checked)}
            label="I confirm every lead currently assigned to this campaign has opted in to receive WhatsApp messages."
          />
          {messageError && (
            <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              {messageError}
            </p>
          )}
          {!loadingTemplates && messageTemplates.length === 0 && !messageError && (
            <p className="text-sm text-slate-600">Add and activate an approved template in Admin → WhatsApp API first.</p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={schedulingMessage}
              onClick={() => {
                setScheduleTarget(null);
                setMessageError("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loadingTemplates || schedulingMessage || !messageTemplates.length || !selectedTemplateId || !scheduledAt || !consentConfirmed || (scheduleTarget?.lead_count ?? 0) === 0}
            >
              {schedulingMessage ? "Scheduling…" : "Schedule message"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(campaignAction)}
        onClose={() => {
          if (!savingCampaignAction) {
            setCampaignAction(null);
            setCampaignActionError("");
          }
        }}
        ariaLabel={campaignAction?.action === "cancel" ? "Confirm cancel scheduled messages" : "Confirm delete campaign"}
        ariaLabelledBy="campaign-action-title"
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div>
            <h2 id="campaign-action-title" className="text-lg font-bold text-slate-900">
              {campaignAction?.action === "cancel" ? "Cancel scheduled messages?" : "Delete campaign?"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {campaignAction?.action === "cancel"
                ? `Scheduled messages for ${campaignAction.name} will be cancelled. The campaign and its leads will remain.`
                  : `${campaignAction?.name} and its campaign lead assignments will be deleted. Lead records remain. Campaigns with delivered messages cannot be deleted.`}
            </p>
          </div>
          {campaignActionError && (
            <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              {campaignActionError}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={savingCampaignAction}
              onClick={() => {
                setCampaignAction(null);
                setCampaignActionError("");
              }}
            >
              Keep campaign
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={savingCampaignAction}
              onClick={() => void performCampaignAction()}
            >
              {savingCampaignAction
                ? campaignAction?.action === "cancel" ? "Cancelling…" : "Deleting…"
                : campaignAction?.action === "cancel" ? "Cancel scheduled messages" : "Delete campaign"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(leadToRemove)}
        onClose={() => {
          if (!removingLead) {
            setLeadToRemove(null);
            setRemoveError("");
          }
        }}
        ariaLabel="Confirm remove lead from campaign"
        ariaLabelledBy="remove-campaign-lead-title"
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div>
            <h2 id="remove-campaign-lead-title" className="text-lg font-bold text-slate-900">
              Remove lead from campaign?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {leadToRemove?.name} will be removed from {selectedCampaign?.name}. The lead record itself will not be deleted.
            </p>
          </div>
          {removeError && (
            <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              {removeError}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={removingLead}
              onClick={() => {
                setLeadToRemove(null);
                setRemoveError("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removingLead}
              onClick={() => void removeLeadFromCampaign()}
            >
              {removingLead ? "Removing…" : "Remove from campaign"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={createOpen}
        onClose={() => {
          if (!saving) {
            setCreateOpen(false);
            setSaveError("");
          }
        }}
        ariaLabel="Create platform campaign"
        ariaLabelledBy="platform-campaign-title"
        size="sm"
      >
        <form onSubmit={createCampaign} className="space-y-4 p-5">
          <div>
            <h2 id="platform-campaign-title" className="text-lg font-bold text-slate-900">New campaign</h2>
            <p className="mt-1 text-sm text-slate-600">Create a campaign before assigning leads to it.</p>
          </div>
          <Input
            label="Campaign name"
            required
            minLength={2}
            maxLength={255}
            value={campaignName}
            disabled={saving}
            onChange={(event) => setCampaignName(event.target.value)}
          />
          <Input
            label="Campaign date"
            required
            type="date"
            value={campaignDate}
            disabled={saving}
            onChange={(event) => setCampaignDate(event.target.value)}
          />
          {saveError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{saveError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !campaignName.trim() || !campaignDate}>
              {saving ? "Creating…" : "Create campaign"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
