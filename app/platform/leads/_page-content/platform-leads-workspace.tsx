"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, X } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { PLATFORM_LEAD_STAGES } from "@/lib/services/platform/platform-lead-constants";

type PlatformLead = {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  company_name: string | null;
  city: string | null;
  source: string | null;
  stage: string;
  created_at: string;
  updated_at: string;
};

const LEAD_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "mobile", label: "Mobile" },
  { key: "company_name", label: "Company name" },
  { key: "city", label: "City" },
  { key: "source", label: "Source" },
  { key: "stage", label: "Stage" },
];

const LEAD_STAGE_GROUPS = {
  NEW: [
    "1-new",
    "Verification",
    "Interested For Demo",
    "Demo Booked",
    "Demo Attended",
    "Potential Dead",
    "2-Potential",
    "Testing WhatsApp msg",
  ],
  DEAD: [
    "3-Dead",
    "MARK AS FROUD",
    "Froud Verfication",
    "Hello blocked",
  ],
  PAID: ["Paid"],
} as const;

type LeadCategory = keyof typeof LEAD_STAGE_GROUPS;

const LEAD_CATEGORIES: Array<{ key: LeadCategory; label: string; description: string }> = [
  { key: "NEW", label: "New", description: "New, verification, demo and potential leads" },
  { key: "DEAD", label: "Dead", description: "Dead, fraud and blocked leads" },
  { key: "PAID", label: "Paid", description: "Converted paid leads" },
];

function LeadEditor({
  lead,
  onClose,
  onSaved,
}: {
  lead: PlatformLead | null;
  onClose: () => void;
  onSaved: (leadId: string) => void;
}) {
  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [mobile, setMobile] = useState(lead?.mobile ?? "");
  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [city, setCity] = useState(lead?.city ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [stage, setStage] = useState(lead?.stage ?? PLATFORM_LEAD_STAGES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        lead ? `/api/platform/leads/${encodeURIComponent(lead.id)}` : "/api/platform/leads",
        {
          method: lead ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, mobile, companyName, city, source, stage }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save lead.");
      onSaved(payload.lead.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save lead.");
    } finally {
      setSaving(false);
    }
  }

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
      <form onSubmit={submit} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        <Input label="Name" required minLength={2} maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />
        <Input label="Email" type="email" maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input label="Mobile" type="tel" maxLength={30} value={mobile} onChange={(event) => setMobile(event.target.value)} hint="Include country code. Provide an email or mobile number." />
        <Input label="Company name" maxLength={255} value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
        <Input label="City" maxLength={120} value={city} onChange={(event) => setCity(event.target.value)} />
        <Input label="Source" maxLength={120} value={source} onChange={(event) => setSource(event.target.value)} placeholder="e.g. Website, referral, event" />
        <Select label="Stage" required value={stage} onChange={(event) => setStage(event.target.value)} options={PLATFORM_LEAD_STAGES.map((value) => ({ label: value, value }))} />
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {saving ? "Saving..." : lead ? "Save changes" : "Create lead"}
          </Button>
        </div>
      </form>
    </aside>
  );
}

export default function PlatformLeadsWorkspace({
  leads,
  selectedLead,
}: {
  leads: PlatformLead[];
  selectedLead: PlatformLead | null;
}) {
  const router = useRouter();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [newLead, setNewLead] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<LeadCategory | null>(null);
  const [stageFilter, setStageFilter] = useState("ALL");
  const [visibleFields, setVisibleFields] = useState<string[]>(LEAD_FIELDS.map(({ key }) => key));
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const filteredLeads = useMemo(
    () => leads.filter((lead) => {
      const inCategory = categoryFilter === null || (
        LEAD_STAGE_GROUPS[categoryFilter] as readonly string[]
      ).includes(lead.stage);
      return inCategory && (stageFilter === "ALL" || lead.stage === stageFilter);
    }),
    [categoryFilter, leads, stageFilter],
  );
  const stageOptions = categoryFilter === null
    ? PLATFORM_LEAD_STAGES
    : LEAD_STAGE_GROUPS[categoryFilter];
  const changeVisibleFields = useCallback((next: (string | keyof PlatformLead)[]) => {
    setVisibleFields(next.map(String));
  }, []);

  function closeEditor() {
    setNewLead(false);
    router.push("/platform/leads");
  }

  function openLead(leadId: string) {
    setNewLead(false);
    router.push(`/platform/leads?leadId=${encodeURIComponent(leadId)}`);
  }

  function openNewLead() {
    setNewLead(true);
    router.push("/platform/leads");
  }

  function handleSaved(leadId: string) {
    setNewLead(false);
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
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-xl font-bold text-slate-900">Leads</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 text-xs text-slate-500">{leads.length} lead{leads.length === 1 ? "" : "s"}</p>
          <form action="/api/platform/leads/export" method="get">
            <Button type="submit" variant="secondary">
              <Download className="h-4 w-4" aria-hidden="true" /> Download Excel
            </Button>
          </form>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={uploadWorkbook}
            className="hidden"
            aria-label="Upload leads workbook"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {uploading ? "Uploading..." : "Upload Excel"}
          </Button>
        </div>
      </header>

      {uploadMessage && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{uploadMessage}</p>}
      {uploadError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p>}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="min-w-0 flex-1 overflow-auto">
          <section aria-label="Lead categories and statuses" className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {LEAD_CATEGORIES.map(({ key, label, description }) => {
                const count = leads.filter((lead) =>
                  (LEAD_STAGE_GROUPS[key] as readonly string[]).includes(lead.stage),
                ).length;
                const active = categoryFilter === key;
                return (
                  <Button
                    key={key}
                    type="button"
                    variant="ghost"
                    aria-pressed={active}
                    onClick={() => {
                      setCategoryFilter(active ? null : key);
                      setStageFilter("ALL");
                    }}
                    className={`h-auto min-h-0 flex-col items-start rounded-xl border px-4 py-3 text-left ${
                      active
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-800 hover:border-emerald-200"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-sm font-bold tabular-nums text-slate-900">{count}</span>
                    </span>
                    <span className="text-[11px] font-normal text-slate-500">{description}</span>
                  </Button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter leads by status">
              <Button
                type="button"
                size="sm"
                variant={stageFilter === "ALL" ? "primary" : "secondary"}
                aria-pressed={stageFilter === "ALL"}
                onClick={() => setStageFilter("ALL")}
              >
                All statuses
              </Button>
              {stageOptions.map((stage) => {
                const count = leads.filter((lead) =>
                  lead.stage === stage &&
                  (categoryFilter === null || (LEAD_STAGE_GROUPS[categoryFilter] as readonly string[]).includes(lead.stage)),
                ).length;
                return (
                  <Button
                    key={stage}
                    type="button"
                    size="sm"
                    variant={stageFilter === stage ? "primary" : "secondary"}
                    aria-pressed={stageFilter === stage}
                    onClick={() => setStageFilter(stage)}
                  >
                    {stage} <span className="text-[10px] opacity-75">({count})</span>
                  </Button>
                );
              })}
            </div>
          </section>
          <ReportGrid
            title="Lead report"
            records={filteredLeads}
            fields={LEAD_FIELDS}
            visibleFields={visibleFields}
            onVisibleFieldsChange={changeVisibleFields}
            storageKey="platform-leads-report-columns-v1"
            rowIdSelector={(lead) => lead.id}
            selectedIds={selectedLead ? [selectedLead.id] : []}
            selectable={false}
            onRowClick={openLead}
            onNewOrder={openNewLead}
            newActionLabel="Add lead"
            emptyMessage="No leads yet. Add a lead to get started."
            renderCell={(fieldKey, lead) => lead[fieldKey as keyof PlatformLead] || "—"}
          />
        </div>
        {(newLead || selectedLead) && (
          <LeadEditor
            key={newLead ? "new-lead" : selectedLead?.id}
            lead={newLead ? null : selectedLead}
            onClose={closeEditor}
            onSaved={handleSaved}
          />
        )}
      </div>
    </section>
  );
}
