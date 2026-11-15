"use client";

import { useMemo, useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import {
  saveOrganizationMsg91Settings,
  saveOrganizationMsg91Template,
  setOrganizationMsg91TemplateActive,
} from "../../actions";
import type {
  OrganizationWhatsAppSettings,
  OrganizationWhatsAppTemplate,
  OrganizationWhatsAppTemplateInput,
} from "@/lib/services/organizations/whatsapp-integration-service";

type Tab = "settings" | "templates";
type TemplateForm = OrganizationWhatsAppTemplateInput;

const EMPTY_TEMPLATE: TemplateForm = {
  templateName: "",
  sampleTemplateText: "",
  integratedNumber: "",
  imageUrl: "",
  languageCode: "en",
  isActive: true,
};

const TEMPLATE_FIELDS = [
  { key: "templateName", label: "Template name" },
  { key: "languageCode", label: "Language" },
  { key: "integratedNumber", label: "Integrated number" },
  { key: "status", label: "Status" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function OrganizationMsg91WhatsAppPage({
  workspaceId,
  organizationId,
  initialSettings,
  initialTemplates,
}: {
  workspaceId: string;
  organizationId: string;
  initialSettings: OrganizationWhatsAppSettings;
  initialTemplates: OrganizationWhatsAppTemplate[];
}) {
  const [tab, setTab] = useState<Tab>("settings");
  const [settings, setSettings] = useState(initialSettings);
  const [apiKey, setApiKey] = useState("");
  const [namespace, setNamespace] = useState(initialSettings.namespace);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [templateNotice, setTemplateNotice] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [visibleFields, setVisibleFields] = useState<string[]>(TEMPLATE_FIELDS.map(({ key }) => key));

  const templateFields = useMemo(() => TEMPLATE_FIELDS, []);
  const filteredTemplates = useMemo(
    () => templates.filter((template) =>
      selectedStatus === "All"
      || (selectedStatus === "Active" ? template.isActive : !template.isActive),
    ),
    [selectedStatus, templates],
  );
  const reportTemplates = useMemo(
    () => filteredTemplates.map((template) => ({
      ...template,
      status: template.isActive ? "Active" : "Inactive",
    })),
    [filteredTemplates],
  );

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    setSettingsError("");
    setSettingsNotice("");
    try {
      const saved = await saveOrganizationMsg91Settings({
        workspaceId,
        organizationId,
        apiKey,
        namespace,
        isActive: settings.isActive,
      });
      setSettings(saved);
      setApiKey("");
      setSettingsNotice("Organization MSG91 settings saved. The API key is encrypted and never displayed.");
    } catch (error) {
      setSettingsError(errorMessage(error, "Unable to save MSG91 settings."));
    } finally {
      setSavingSettings(false);
    }
  }

  function startNewTemplate() {
    setEditingTemplateId(null);
    setTemplateForm(EMPTY_TEMPLATE);
    setTemplateError("");
    setTemplateNotice("");
    setTemplateFormOpen(true);
  }

  function startEditTemplate(template: OrganizationWhatsAppTemplate) {
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
    setTemplateNotice("");
    setTemplateFormOpen(true);
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingTemplate) return;
    setSavingTemplate(true);
    setTemplateError("");
    setTemplateNotice("");
    try {
      const saved = await saveOrganizationMsg91Template({
        workspaceId,
        organizationId,
        templateId: editingTemplateId ?? undefined,
        template: templateForm,
      });
      setTemplates((current) => [
        saved,
        ...current.filter(({ id }) => id !== saved.id),
      ].sort((left, right) => left.templateName.localeCompare(right.templateName)));
      setTemplateFormOpen(false);
      setTemplateNotice(editingTemplateId ? "Template updated." : "Template added.");
      setTemplateForm(EMPTY_TEMPLATE);
    } catch (error) {
      setTemplateError(errorMessage(error, "Unable to save the WhatsApp template."));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function toggleTemplate(template: OrganizationWhatsAppTemplate) {
    setTemplateError("");
    try {
      const result = await setOrganizationMsg91TemplateActive({
        workspaceId,
        organizationId,
        templateId: template.id,
        isActive: !template.isActive,
      });
      setTemplates((current) => current.map((item) =>
        item.id === result.id ? { ...item, isActive: result.isActive } : item,
      ));
    } catch (error) {
      setTemplateError(errorMessage(error, "Unable to update template status."));
    }
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="erp-eyebrow">Admin / Integrations / WhatsApp / MSG91</p>
              <h1 className="erp-page-heading">MSG91 WhatsApp API</h1>
              <p className="mt-1 text-sm text-slate-600">
                Configure provider credentials and the approved templates for this organization.
              </p>
            </div>
          </div>
          <Badge>{settings.isActive ? "Enabled" : settings.hasApiKey ? "Disabled" : "Setup required"}</Badge>
        </header>

        <Tabs
          ariaLabel="Organization MSG91 WhatsApp settings"
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
              <form onSubmit={submitSettings} className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">MSG91 connection</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    These credentials belong only to this organization. The API key is encrypted at rest.
                  </p>
                </div>
                <Input
                  label={settings.hasApiKey ? "Replace API key (optional)" : "MSG91 API key"}
                  type="password"
                  textCase="preserve"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={settings.hasApiKey ? "Leave blank to keep the current key" : "Enter MSG91 API key"}
                  required={!settings.hasApiKey}
                  maxLength={2500}
                />
                <Input
                  label="Template namespace"
                  textCase="preserve"
                  value={namespace}
                  onChange={(event) => setNamespace(event.target.value)}
                  required
                  maxLength={255}
                  hint="Enter the namespace configured in this organization's MSG91 account."
                />
                <Checkbox
                  checked={settings.isActive}
                  onChange={(event) => setSettings((current) => ({ ...current, isActive: event.target.checked }))}
                  label="Enable this organization's MSG91 integration"
                />
                {settingsError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{settingsError}</p>}
                {settingsNotice && <p role="status" className="rounded-lg border border-[var(--erp-success)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-success)]">{settingsNotice}</p>}
                <Button type="submit" variant="primary" disabled={savingSettings || !namespace.trim()}>
                  {savingSettings ? "Saving…" : "Save settings"}
                </Button>
              </form>
            </Card>

            <Card className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Before connecting</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Use an API key from the MSG91 account that owns this organization&apos;s WhatsApp number.
                </p>
              </div>
              <ul className="list-inside list-disc space-y-2 text-sm text-slate-600">
                <li>Copy the namespace exactly as shown in the MSG91 account.</li>
                <li>Only templates approved for that account should be added on the Templates tab.</li>
                <li>Saving credentials here does not change the separate platform WhatsApp integration.</li>
              </ul>
            </Card>
          </div>
        ) : (
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">WhatsApp templates</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Templates must already be approved and enabled in this organization&apos;s MSG91 account.
                </p>
              </div>
              {!templateFormOpen && (
                <Button type="button" variant="primary" onClick={startNewTemplate}>Add template</Button>
              )}
            </div>

            {templateNotice && <p role="status" className="rounded-lg border border-[var(--erp-success)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-success)]">{templateNotice}</p>}
            {templateError && !templateFormOpen && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{templateError}</p>}

            {templateFormOpen && (
              <form onSubmit={submitTemplate} className="space-y-4 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {editingTemplateId ? "Edit WhatsApp template" : "Add WhatsApp template"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">Enter the details exactly as configured with MSG91.</p>
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Input label="Template name" textCase="preserve" required maxLength={255} value={templateForm.templateName} onChange={(event) => setTemplateForm((current) => ({ ...current, templateName: event.target.value }))} />
                  <Input label="Integrated WhatsApp number" textCase="preserve" required maxLength={20} value={templateForm.integratedNumber} onChange={(event) => setTemplateForm((current) => ({ ...current, integratedNumber: event.target.value }))} />
                  <Input label="Language code" textCase="preserve" required maxLength={20} value={templateForm.languageCode} onChange={(event) => setTemplateForm((current) => ({ ...current, languageCode: event.target.value }))} />
                  <Input label="Header image URL (optional)" textCase="preserve" type="url" maxLength={2048} value={templateForm.imageUrl} onChange={(event) => setTemplateForm((current) => ({ ...current, imageUrl: event.target.value }))} />
                </div>
                <Textarea
                  label="Sample template text"
                  textCase="preserve"
                  required
                  maxLength={5000}
                  rows={4}
                  value={templateForm.sampleTemplateText}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, sampleTemplateText: event.target.value }))}
                />
                <Checkbox
                  checked={templateForm.isActive}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, isActive: event.target.checked }))}
                  label="Available for use"
                />
                {templateError && <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{templateError}</p>}
                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--erp-border)] pt-3">
                  <Button type="button" variant="secondary" disabled={savingTemplate} onClick={() => { setTemplateFormOpen(false); setTemplateError(""); }}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={savingTemplate}>
                    {savingTemplate ? "Saving…" : editingTemplateId ? "Save changes" : "Add template"}
                  </Button>
                </div>
              </form>
            )}

            <ReportGrid
              title="Organization WhatsApp templates"
              records={reportTemplates}
              fields={templateFields}
              visibleFields={visibleFields}
              onVisibleFieldsChange={(fields) => setVisibleFields(fields.map(String))}
              storageKey={`organization-whatsapp-templates:${organizationId}`}
              rowIdSelector={(template) => template.id}
              selectedIds={[]}
              selectable={false}
              statusOptions={["All", "Active", "Inactive"]}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              rowActions={(template) => (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => startEditTemplate(template)}>
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
              )}
              renderCell={(fieldKey, template) => template[fieldKey as keyof typeof template] || "—"}
              emptyMessage="No WhatsApp templates are configured for this organization."
            />
          </Card>
        )}
      </Section>
    </Page>
  );
}
