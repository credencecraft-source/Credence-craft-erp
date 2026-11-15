"use client";

import { useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import { ReportGrid } from "@/components/reports/report-grid-display";

type WhatsAppTemplate = {
  id: string;
  templateName: string;
  sampleTemplateText: string;
  integratedNumber: string;
  imageUrl: string;
  languageCode: string;
  isActive: boolean;
};

type TemplateForm = Omit<WhatsAppTemplate, "id">;
type WhatsAppTab = "settings" | "templates";

const TEMPLATE_FIELDS = [
  { key: "templateName", label: "Template name" },
  { key: "languageCode", label: "Language" },
  { key: "integratedNumber", label: "Integrated number" },
  { key: "isActive", label: "Status" },
  { key: "actions", label: "Actions" },
];

const EMPTY_TEMPLATE: TemplateForm = {
  templateName: "",
  sampleTemplateText: "",
  integratedNumber: "",
  imageUrl: "",
  languageCode: "en",
  isActive: true,
};

function normalizeTemplate(raw: Record<string, unknown>): WhatsAppTemplate {
  return {
    id: String(raw.id ?? ""),
    templateName: String(raw.templateName ?? raw.template_name ?? ""),
    sampleTemplateText: String(raw.sampleTemplateText ?? raw.sample_template_text ?? ""),
    integratedNumber: String(raw.integratedNumber ?? raw.integrated_number ?? ""),
    imageUrl: String(raw.imageUrl ?? raw.image_url ?? ""),
    languageCode: String(raw.languageCode ?? raw.language_code ?? ""),
    isActive: raw.isActive === true || raw.is_active === true,
  };
}

async function readResponse(response: Response) {
  const payload: unknown = await response.json();
  const body = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : {};
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "The request could not be completed.");
  }
  return body;
}

export default function PlatformWhatsAppPage({
  initialSettings,
  initialTemplates,
}: {
  initialSettings: {
    hasApiKey: boolean;
    namespace: string;
    hasDeliveryCallback: boolean;
    updatedAt: string | null;
  };
  initialTemplates: WhatsAppTemplate[];
}) {
  const [tab, setTab] = useState<WhatsAppTab>("settings");
  const [settings, setSettings] = useState(initialSettings);
  const [apiKey, setApiKey] = useState("");
  const [namespace, setNamespace] = useState(initialSettings.namespace);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [deliveryCallbackUrl, setDeliveryCallbackUrl] = useState("");
  const [deliveryCallbackToken, setDeliveryCallbackToken] = useState("");
  const [rotatingToken, setRotatingToken] = useState(false);
  const [callbackError, setCallbackError] = useState("");
  const [copied, setCopied] = useState(false);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    setSettingsError("");
    setSettingsNotice("");
    try {
      const response = await fetch("/api/platform/whatsapp/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, namespace }),
      });
      const result = await readResponse(response);
      setSettings((current) => ({
        ...current,
        ...(result.settings as { hasApiKey: boolean; namespace: string }),
      }));
      setApiKey("");
      setSettingsNotice("MSG91 settings saved. The API key remains encrypted and is never displayed.");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  function openNewTemplate() {
    setEditingTemplateId(null);
    setTemplateForm(EMPTY_TEMPLATE);
    setTemplateError("");
    setTemplateModalOpen(true);
  }

  function openEditTemplate(template: WhatsAppTemplate) {
    setEditingTemplateId(template.id);
    setTemplateForm({
      templateName: template.templateName,
      sampleTemplateText: template.sampleTemplateText,
      integratedNumber: template.integratedNumber,
      imageUrl: template.imageUrl,
      languageCode: template.languageCode,
      isActive: template.isActive,
    });
    setTemplateError("");
    setTemplateModalOpen(true);
  }

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingTemplate) return;
    setSavingTemplate(true);
    setTemplateError("");
    try {
      const response = await fetch(
        editingTemplateId
          ? `/api/platform/whatsapp/templates/${encodeURIComponent(editingTemplateId)}`
          : "/api/platform/whatsapp/templates",
        {
          method: editingTemplateId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateForm),
        },
      );
      const result = await readResponse(response);
      const template = normalizeTemplate(result.template as Record<string, unknown>);
      setTemplates((current) => [
        template,
        ...current.filter(({ id }) => id !== template.id),
      ].sort((left, right) => left.templateName.localeCompare(right.templateName)));
      setTemplateModalOpen(false);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "Unable to save template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function toggleTemplate(template: WhatsAppTemplate) {
    setTemplateError("");
    try {
      const response = await fetch(
        `/api/platform/whatsapp/templates/${encodeURIComponent(template.id)}/active`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !template.isActive }),
        },
      );
      const result = await readResponse(response);
      const updated = normalizeTemplate(result.template as Record<string, unknown>);
      setTemplates((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "Unable to update template status.");
    }
  }

  async function generateDeliveryCallback() {
    if (rotatingToken) return;
    setRotatingToken(true);
    setCallbackError("");
    setCopied(false);
    try {
      const response = await fetch("/api/platform/whatsapp/delivery-token", { method: "POST" });
      const result = await readResponse(response);
      if (typeof result.token !== "string") throw new Error("The callback token was not returned.");
      setDeliveryCallbackUrl(`${window.location.origin}/api/platform/whatsapp/delivery`);
      setDeliveryCallbackToken(result.token);
      setSettings((current) => ({ ...current, hasDeliveryCallback: true }));
    } catch (error) {
      setCallbackError(error instanceof Error ? error.message : "Unable to generate callback URL.");
    } finally {
      setRotatingToken(false);
    }
  }

  async function copyCallbackUrl() {
    try {
      await navigator.clipboard.writeText(deliveryCallbackToken);
      setCopied(true);
    } catch {
      setCallbackError("Clipboard access was denied. Select and copy the callback URL manually.");
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">MSG91 WhatsApp API</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure provider credentials and approved WhatsApp message templates for campaigns.
          </p>
        </div>
        <Badge>
          {settings.hasApiKey ? "API key configured" : "Setup required"}
        </Badge>
      </header>

      <Tabs
        ariaLabel="MSG91 WhatsApp settings"
        value={tab}
        onChange={setTab}
        tabs={[
          { label: "Settings", value: "settings" },
          { label: `Templates (${templates.length})`, value: "templates" },
        ]}
      />

      {tab === "settings" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Card>
            <form onSubmit={saveSettings} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">MSG91 connection</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Use an API key dedicated to WhatsApp template messaging. Keys are encrypted at rest.
                </p>
              </div>
              <Input
                label={settings.hasApiKey ? "Replace API key (optional)" : "MSG91 API key"}
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings.hasApiKey ? "Leave blank to keep the current key" : "Enter MSG91 API key"}
                required={!settings.hasApiKey}
                maxLength={2500}
              />
              <Input
                label="Template namespace"
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
                required
                maxLength={255}
              />
              {settingsError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{settingsError}</p>}
              {settingsNotice && <p role="status" className="rounded-lg border border-[var(--erp-success)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-success)]">{settingsNotice}</p>}
              <Button type="submit" variant="primary" disabled={savingSettings || !namespace.trim()}>
                {savingSettings ? "Saving…" : "Save settings"}
              </Button>
            </form>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Delivery status callback</h2>
              <p className="mt-1 text-sm text-slate-600">
                Generate a callback token, then configure the MSG91 webhook to POST its request ID, recipient mobile, and status (sent, delivered, read, or failed). The token must be sent in an Authorization Bearer header or X-MSG91-Callback-Token header.
              </p>
            </div>
            {settings.hasDeliveryCallback && !deliveryCallbackUrl && (
              <p className="rounded-lg border border-[var(--erp-warning)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-warning)]">
                A callback token exists. It cannot be displayed again; rotate it to get a new URL.
              </p>
            )}
            <Button type="button" variant="secondary" disabled={rotatingToken} onClick={() => void generateDeliveryCallback()}>
              {rotatingToken ? "Generating…" : settings.hasDeliveryCallback ? "Rotate callback URL" : "Generate callback URL"}
            </Button>
            {deliveryCallbackUrl && (
              <div className="space-y-2">
                <Input label="MSG91 delivery webhook URL" readOnly value={deliveryCallbackUrl} />
                <Input label="Callback token (shown only now)" type="password" readOnly value={deliveryCallbackToken} />
                <p className="text-xs text-slate-600">
                  Configure the URL and token securely in MSG91. Rotating the token invalidates the previous one.
                </p>
                <Button type="button" variant="secondary" onClick={() => void copyCallbackUrl()}>
                  {copied ? "Token copied" : "Copy callback token"}
                </Button>
              </div>
            )}
            {callbackError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{callbackError}</p>}
          </Card>
        </div>
      ) : (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">WhatsApp templates</h2>
              <p className="mt-1 text-sm text-slate-600">
                Templates must already be approved and enabled in your MSG91/WhatsApp account.
              </p>
            </div>
            <Button type="button" variant="primary" onClick={openNewTemplate}>Add template</Button>
          </div>
          {templateError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{templateError}</p>}
          <ReportGrid
            title="WhatsApp templates"
            records={templates}
            fields={TEMPLATE_FIELDS}
            visibleFields={TEMPLATE_FIELDS.map(({ key }) => key)}
            onVisibleFieldsChange={() => undefined}
            rowIdSelector={(template) => template.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={(templateId) => {
              const template = templates.find((item) => item.id === templateId);
              if (template) openEditTemplate(template);
            }}
            renderCell={(fieldKey, template) => {
              if (fieldKey === "isActive") return template.isActive ? "Active" : "Inactive";
              if (fieldKey === "actions") {
                return (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => openEditTemplate(template)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant={template.isActive ? "destructive" : "secondary"}
                      size="sm"
                      onClick={() => void toggleTemplate(template)}
                    >
                      {template.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                );
              }
              return template[fieldKey as keyof WhatsAppTemplate] || "—";
            }}
            emptyMessage="No WhatsApp templates configured."
          />
        </Card>
      )}

      <Modal
        open={templateModalOpen}
        onClose={() => {
          if (!savingTemplate) {
            setTemplateModalOpen(false);
            setTemplateError("");
          }
        }}
        ariaLabel="WhatsApp template"
        ariaLabelledBy="platform-whatsapp-template-title"
        size="md"
      >
        <form onSubmit={saveTemplate} className="space-y-4 p-5">
          <div>
            <h2 id="platform-whatsapp-template-title" className="text-lg font-bold text-slate-900">
              {editingTemplateId ? "Edit WhatsApp template" : "Add WhatsApp template"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">Enter the template details exactly as configured with MSG91.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Template name" required maxLength={255} value={templateForm.templateName} onChange={(event) => setTemplateForm((current) => ({ ...current, templateName: event.target.value }))} />
            <Input label="Integrated WhatsApp number" required maxLength={20} value={templateForm.integratedNumber} onChange={(event) => setTemplateForm((current) => ({ ...current, integratedNumber: event.target.value }))} />
            <Input label="Language code" required maxLength={20} value={templateForm.languageCode} onChange={(event) => setTemplateForm((current) => ({ ...current, languageCode: event.target.value }))} />
            <Input label="Header image URL (optional)" type="url" maxLength={2048} value={templateForm.imageUrl} onChange={(event) => setTemplateForm((current) => ({ ...current, imageUrl: event.target.value }))} />
          </div>
          <Textarea
            label="Sample template text"
            required
            maxLength={5000}
            rows={4}
            value={templateForm.sampleTemplateText}
            onChange={(event) => setTemplateForm((current) => ({ ...current, sampleTemplateText: event.target.value }))}
          />
          <Checkbox
          checked={templateForm.isActive}
          onChange={(event) => setTemplateForm((current) => ({ ...current, isActive: event.target.checked }))}
          label="Available for campaign sends"
          />
          {templateError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{templateError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" disabled={savingTemplate} onClick={() => setTemplateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingTemplate}>
              {savingTemplate ? "Saving…" : editingTemplateId ? "Save changes" : "Add template"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
