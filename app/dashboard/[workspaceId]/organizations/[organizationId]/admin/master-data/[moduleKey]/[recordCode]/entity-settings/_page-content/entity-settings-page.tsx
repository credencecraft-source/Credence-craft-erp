"use client";

import Link from "next/link";
import { Folder, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";

type DivisionRecord = {
  id: string;
  entity_id: string;
  division_name: string;
  division_code: string;
  description: string | null;
  is_active: boolean;
};

type GstRegistration = {
  id: string;
  gstin: string;
  registration_state: string;
  registration_type: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
};

type DivisionForm = Pick<DivisionRecord, "division_name" | "division_code" | "description" | "is_active">;

function responseError(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload
    ? String(payload.error)
    : fallback;
}

export default function EntitySettingsPage({
  workspaceId,
  organizationId,
  entityId,
  entityName,
}: {
  workspaceId: string;
  organizationId: string;
  entityId: string;
  entityName: string;
}) {
  const [divisions, setDivisions] = useState<DivisionRecord[]>([]);
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDivisionId, setEditingDivisionId] = useState<string | null>(null);
  const [divisionForm, setDivisionForm] = useState<DivisionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [divisionsResponse, registrationsResponse] = await Promise.all([
        fetch(`/api/organizations/${encodeURIComponent(organizationId)}/divisions`, { cache: "no-store" }),
        fetch(`/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/gst-registrations`, { cache: "no-store" }),
      ]);
      const [divisionsPayload, registrationsPayload] = await Promise.all([
        divisionsResponse.json(),
        registrationsResponse.json(),
      ]);
      if (!divisionsResponse.ok) throw new Error(responseError(divisionsPayload, "Unable to load Entity Division."));
      if (!registrationsResponse.ok) throw new Error(responseError(registrationsPayload, "Unable to load GST registrations."));
      setDivisions((divisionsPayload.divisions as DivisionRecord[]).filter((item) => item.entity_id === entityId));
      setRegistrations(registrationsPayload.registrations as GstRegistration[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Entity master data.");
    } finally {
      setLoading(false);
    }
  }, [entityId, organizationId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const reportFields = useMemo(() => [
    { key: "gstin", label: "GSTIN" },
    { key: "registration_state", label: "Registration State" },
    { key: "registration_type", label: "Registration Type" },
    { key: "effective_from", label: "Effective From" },
    { key: "effective_to", label: "Effective To" },
    { key: "status", label: "Status" },
  ], []);
  const [visibleFields, setVisibleFields] = useState<(keyof GstRegistration | string)[]>([
    "gstin",
    "registration_state",
    "registration_type",
    "effective_from",
    "effective_to",
    "status",
  ]);
  const reportRows = registrations.map((registration) => ({
    ...registration,
    gstin: `••••••••••${registration.gstin.slice(-5)}`,
    effective_from: registration.effective_from.slice(0, 10),
    effective_to: registration.effective_to?.slice(0, 10) ?? "—",
    status: registration.is_active ? "Active" : "Inactive",
  }));
  async function saveDivision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!divisionForm) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const isUpdate = Boolean(editingDivisionId);
      const endpoint = isUpdate
        ? `/api/organizations/${encodeURIComponent(organizationId)}/divisions/${encodeURIComponent(editingDivisionId!)}`
        : `/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(entityId)}/divisions`;
      const response = await fetch(endpoint, {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionName: divisionForm.division_name,
          divisionCode: divisionForm.division_code,
          description: divisionForm.description,
          ...(isUpdate ? { isActive: divisionForm.is_active } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseError(payload, "Unable to save Division."));
      setDivisionForm(null);
      setEditingDivisionId(null);
      await loadRecords();
      setNotice(isUpdate ? "Division saved." : "Division created.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save Division.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page as="div">
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--erp-muted)]">Entity master data</p>
            <h1 className="text-2xl font-semibold text-[var(--erp-text)]">{entityName}</h1>
          </div>
          <Link href={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/entity/${encodeURIComponent(entityId)}`}>
            <Button variant="secondary">Back to Entity</Button>
          </Link>
        </div>

        {error ? <p className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
        {notice ? <p className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-text)]" role="status">{notice}</p> : null}
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading Entity master data...</p> : null}

        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--erp-text)]">Divisions</h2>
              <p className="text-sm text-[var(--erp-muted)]">Create and manage this Entity’s divisions.</p>
            </div>
            {!divisionForm ? <Button onClick={() => {
              setEditingDivisionId(null);
              setDivisionForm({ division_name: "", division_code: "", description: "", is_active: true });
            }}>Create Division</Button> : null}
          </div>

          {divisionForm ? (
            <form onSubmit={saveDivision} className="grid gap-4 sm:grid-cols-2">
              <Input label="Division Name" value={divisionForm.division_name} onChange={(event) => setDivisionForm({ ...divisionForm, division_name: event.target.value })} required maxLength={255} />
              <Input label="Division Code" value={divisionForm.division_code} onChange={(event) => setDivisionForm({ ...divisionForm, division_code: event.target.value })} required maxLength={100} />
              <Input label="Description" value={divisionForm.description ?? ""} onChange={(event) => setDivisionForm({ ...divisionForm, description: event.target.value })} maxLength={1000} />
              {editingDivisionId ? (
                <Select label="Status" value={String(divisionForm.is_active)} onChange={(event) => setDivisionForm({ ...divisionForm, is_active: event.target.value === "true" })}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              ) : null}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : editingDivisionId ? "Save Division" : "Create Division"}</Button>
                <Button variant="secondary" disabled={saving} onClick={() => { setDivisionForm(null); setEditingDivisionId(null); }}>Cancel</Button>
              </div>
            </form>
          ) : null}

          {divisions.length ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {divisions.map((division) => (
                <Card key={division.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/entity/${encodeURIComponent(entityId)}/divisions/${encodeURIComponent(division.id)}`}
                      className="group flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                      aria-label={`Open ${division.division_name} Division folder`}
                    >
                      <Folder aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--erp-brand)]" />
                      <h3 className="truncate font-semibold text-[var(--erp-text)] group-hover:text-[var(--erp-brand)]">{division.division_name}</h3>
                      <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--erp-muted)]" />
                    </Link>
                    <Badge>{division.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="text-sm text-[var(--erp-muted)]">Code: {division.division_code}</p>
                  {division.description ? <p className="text-sm text-[var(--erp-muted)]">{division.description}</p> : null}
                  <Link
                    href={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/entity/${encodeURIComponent(entityId)}/divisions/${encodeURIComponent(division.id)}`}
                    className="inline-flex rounded-md text-sm font-semibold text-[var(--erp-brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                  >
                    Open Locations
                  </Link>
                  <Button variant="secondary" size="sm" onClick={() => {
                    setEditingDivisionId(division.id);
                    setDivisionForm({
                      division_name: division.division_name,
                      division_code: division.division_code,
                      description: division.description ?? "",
                      is_active: division.is_active,
                    });
                  }}>Edit Division</Button>
                </Card>
              ))}
            </div>
          ) : !loading && !error ? (
            <p className="text-sm text-[var(--erp-muted)]">No divisions are configured for this Entity.</p>
          ) : null}
        </Card>

        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--erp-text)]">GST registration history</h2>
              <p className="text-sm text-[var(--erp-muted)]">Edit the Entity to maintain its current GSTIN and registered address. Existing dated registrations remain available here for history.</p>
            </div>
            <Link href={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/entity/${encodeURIComponent(entityId)}?mode=edit`}>
              <Button variant="secondary">Edit Entity Details</Button>
            </Link>
          </div>
          <ReportGrid
            title="Entity GST registrations"
            records={reportRows}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={setVisibleFields}
            storageKey={`entity-gst-registrations:${organizationId}:${entityId}`}
            rowIdSelector={(record) => record.id}
            selectedIds={[]}
            selectable={false}
            renderCell={(fieldKey, record) => fieldKey === "status"
              ? <Badge>{record.is_active ? "Active" : "Inactive"}</Badge>
              : String(record[fieldKey as keyof typeof record] ?? "—")}
            emptyMessage={loading ? "Loading GST registrations..." : error ? "Unable to load GST registrations." : "No GST registrations are configured for this Entity."}
          />
        </Card>
      </Section>
    </Page>
  );
}
