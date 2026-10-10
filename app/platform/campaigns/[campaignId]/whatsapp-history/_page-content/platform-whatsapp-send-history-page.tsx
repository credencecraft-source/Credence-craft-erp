"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { ReportGrid } from "@/components/reports/report-grid-display";

type WhatsAppHistoryMessage = {
  id: string;
  scheduled_at: string;
  status: string;
  submitted_at: string | null;
  failure_summary: string | null;
  template: { template_name: string };
  recipients: Array<{
    customer_name: string;
    phone_number: string;
    status: string;
    failure_summary: string | null;
    delivered_at: string | null;
  }>;
};

const MESSAGE_FIELDS = [
  { key: "template", label: "Template" },
  { key: "scheduled_at", label: "Scheduled" },
  { key: "submitted_at", label: "Submitted" },
  { key: "status", label: "Status" },
  { key: "recipient_count", label: "Recipients" },
  { key: "delivered_count", label: "Delivered" },
  { key: "failed_count", label: "Failed" },
  { key: "failure_summary", label: "Details" },
  { key: "actions", label: "Actions" },
];

const RECIPIENT_FIELDS = [
  { key: "customer_name", label: "Customer" },
  { key: "phone_number", label: "Mobile" },
  { key: "status", label: "Delivery status" },
  { key: "delivered_at", label: "Delivered at" },
  { key: "failure_summary", label: "Details" },
];

type ScheduleAction = {
  messageId: string;
  action: "cancel" | "delete";
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function PlatformWhatsAppSendHistoryPage({
  campaignId,
  campaignName,
  messages: initialMessages,
}: {
  campaignId: string;
  campaignName: string;
  messages: WhatsAppHistoryMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [scheduleAction, setScheduleAction] = useState<ScheduleAction | null>(null);
  const [scheduleActionError, setScheduleActionError] = useState("");
  const [savingScheduleAction, setSavingScheduleAction] = useState(false);
  const selectedMessage = messages.find(({ id }) => id === selectedMessageId);
  const records = messages.map((message) => ({
    ...message,
    recipient_count: message.recipients.length,
    delivered_count: message.recipients.filter(({ status }) => status === "DELIVERED" || status === "READ").length,
    failed_count: message.recipients.filter(({ status }) => status === "FAILED").length,
    hasDeliveredRecipient: message.recipients.some(({ status }) => status === "DELIVERED" || status === "READ"),
    hasInFlightDelivery: ["PROCESSING", "SUBMITTED", "UNKNOWN"].includes(message.status) ||
      message.recipients.some(({ status }) => status === "SUBMITTED"),
  }));

  async function performScheduleAction() {
    if (!scheduleAction || savingScheduleAction) return;
    setSavingScheduleAction(true);
    setScheduleActionError("");
    try {
      const baseUrl = `/api/platform/campaigns/${encodeURIComponent(campaignId)}/messages/${encodeURIComponent(scheduleAction.messageId)}`;
      const response = await fetch(
        scheduleAction.action === "cancel" ? `${baseUrl}/cancel` : baseUrl,
        { method: scheduleAction.action === "cancel" ? "POST" : "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update WhatsApp schedule.");

      if (scheduleAction.action === "cancel") {
        setMessages((current) => current.map((message) => message.id === scheduleAction.messageId
          ? { ...message, status: "CANCELLED", failure_summary: "Cancelled by platform administrator." }
          : message));
      } else {
        setMessages((current) => current.filter((message) => message.id !== scheduleAction.messageId));
        if (selectedMessageId === scheduleAction.messageId) setSelectedMessageId(null);
      }
      setScheduleAction(null);
      router.refresh();
    } catch (error) {
      setScheduleActionError(error instanceof Error ? error.message : "Unable to update WhatsApp schedule.");
    } finally {
      setSavingScheduleAction(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">WhatsApp send history</h1>
          <p className="mt-1 text-sm text-slate-600">{campaignName}</p>
          <p className="mt-1 break-all text-xs text-slate-500">Campaign ID: {campaignId}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => router.push("/platform/campaigns")}>
          Back to campaigns
        </Button>
      </header>

      <ReportGrid
        title="WhatsApp send history"
        records={records}
        fields={MESSAGE_FIELDS}
        visibleFields={MESSAGE_FIELDS.map(({ key }) => key)}
        onVisibleFieldsChange={() => undefined}
        rowIdSelector={(message) => message.id}
        selectedIds={selectedMessageId ? [selectedMessageId] : []}
        selectable={false}
        onRowClick={(messageId) => setSelectedMessageId((current) => current === messageId ? null : messageId)}
        renderCell={(fieldKey, message) => {
          if (fieldKey === "template") return message.template.template_name;
          if (fieldKey === "scheduled_at" || fieldKey === "submitted_at") return formatDateTime(message[fieldKey]);
          if (fieldKey === "recipient_count" || fieldKey === "delivered_count" || fieldKey === "failed_count") {
            return message[fieldKey];
          }
          if (fieldKey === "actions") {
            return (
              <div className="flex min-w-max items-center gap-2" onClick={(event) => event.stopPropagation()}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedMessageId((current) => current === message.id ? null : message.id)}
                >
                  {selectedMessageId === message.id ? "Hide recipients" : "View recipients"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={message.status !== "SCHEDULED" || message.hasDeliveredRecipient || message.hasInFlightDelivery}
                  title={message.status === "SCHEDULED" && !message.hasDeliveredRecipient && !message.hasInFlightDelivery
                    ? "Cancel this scheduled send"
                    : message.hasDeliveredRecipient
                      ? "Cannot cancel after message delivery"
                      : "Only scheduled sends can be cancelled"}
                  onClick={() => {
                    setScheduleActionError("");
                    setScheduleAction({ messageId: message.id, action: "cancel" });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={!["SCHEDULED", "CANCELLED", "FAILED"].includes(message.status) ||
                    message.hasDeliveredRecipient || message.hasInFlightDelivery}
                  title={message.hasDeliveredRecipient
                    ? "Cannot delete after message delivery"
                    : message.hasInFlightDelivery
                      ? "Cannot delete while delivery status is unresolved"
                      : "Delete this unsent schedule"}
                  onClick={() => {
                    setScheduleActionError("");
                    setScheduleAction({ messageId: message.id, action: "delete" });
                  }}
                >
                  Delete schedule
                </Button>
              </div>
            );
          }
          if (fieldKey === "failure_summary") return message.failure_summary || "—";
          if (fieldKey === "status") return message.status;
          return "—";
        }}
        emptyMessage="No WhatsApp messages have been scheduled for this campaign."
      />

      {selectedMessage && (
        <ReportGrid
          title="Recipient delivery status"
          records={selectedMessage.recipients}
          fields={RECIPIENT_FIELDS}
          visibleFields={RECIPIENT_FIELDS.map(({ key }) => key)}
          onVisibleFieldsChange={() => undefined}
          rowIdSelector={(recipient) => `${recipient.phone_number}-${recipient.customer_name}`}
          selectedIds={[]}
          selectable={false}
          onRowClick={() => undefined}
          renderCell={(fieldKey, recipient) => {
            if (fieldKey === "delivered_at") return formatDateTime(recipient.delivered_at);
            return recipient[fieldKey as keyof typeof recipient] || "—";
          }}
          emptyMessage="No recipient statuses are available."
        />
      )}

      <Modal
        open={Boolean(scheduleAction)}
        onClose={() => {
          if (!savingScheduleAction) {
            setScheduleAction(null);
            setScheduleActionError("");
          }
        }}
        ariaLabel={scheduleAction?.action === "cancel" ? "Confirm cancel WhatsApp schedule" : "Confirm delete WhatsApp schedule"}
        ariaLabelledBy="whatsapp-schedule-action-title"
        size="sm"
      >
        <div className="space-y-4 p-5">
          <div>
            <h2 id="whatsapp-schedule-action-title" className="text-lg font-bold text-slate-900">
              {scheduleAction?.action === "cancel" ? "Cancel scheduled send?" : "Delete scheduled send?"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {scheduleAction?.action === "cancel"
                ? "This stops the message from being submitted to MSG91. It cannot cancel a message already submitted or delivered."
                : "This permanently removes the schedule and its recipient rows. Delivered, submitted, or unresolved messages cannot be deleted."}
            </p>
          </div>
          {scheduleActionError && (
            <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              {scheduleActionError}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={savingScheduleAction}
              onClick={() => {
                setScheduleAction(null);
                setScheduleActionError("");
              }}
            >
              Keep schedule
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={savingScheduleAction}
              onClick={() => void performScheduleAction()}
            >
              {savingScheduleAction
                ? scheduleAction?.action === "cancel" ? "Cancelling…" : "Deleting…"
                : scheduleAction?.action === "cancel" ? "Cancel send" : "Delete schedule"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
