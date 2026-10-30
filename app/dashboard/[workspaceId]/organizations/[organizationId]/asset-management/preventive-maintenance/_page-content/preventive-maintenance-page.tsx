"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import { ReportGrid } from "@/components/reports/report-grid-display";

type AssetOption = { id: string; raw_material_name: string; manufacturer: string | null; model_number: string | null };
type LocationOption = { id: string; location_name: string };
type MaintenanceAsset = {
  id: string;
  asset_tag: string;
  serial_number: string | null;
  criticality: string;
  status: string;
  rawMaterial: { raw_material_name: string; manufacturer: string | null; model_number: string | null };
  location: { location_name: string };
};
type MaintenancePlan = {
  id: string;
  plan_name: string;
  interval_days: number;
  next_due_date: string;
  is_active: boolean;
  asset: { id: string; asset_tag: string; status: string; rawMaterial: { raw_material_name: string } };
  checklist: Array<{ id: string; instruction: string }>;
};
type WorkOrder = {
  id: string;
  status: string;
  scheduled_for: string;
  completed_by: string | null;
  completed_at: string | null;
  downtime_minutes: number | null;
  completion_notes: string | null;
  asset: { id: string; asset_tag: string; rawMaterial: { raw_material_name: string }; location: { location_name: string } };
  checklist: Array<{ id: string; instruction: string; is_completed: boolean; completion_note: string | null }>;
};
type DashboardData = {
  assetOptions: AssetOption[];
  locations: LocationOption[];
  assets: MaintenanceAsset[];
  plans: MaintenancePlan[];
  workOrders: WorkOrder[];
};
type TabValue = "equipment" | "plans" | "work-orders";
type EquipmentReportRow = {
  id: string;
  assetTag: string;
  assetType: string;
  serialNumber: string;
  location: string;
  criticality: string;
  status: string;
};
type PlanReportRow = {
  id: string;
  planName: string;
  assetTag: string;
  assetType: string;
  repeatInterval: string;
  nextDueDate: string;
  status: string;
};
type WorkOrderReportRow = {
  id: string;
  assetTag: string;
  assetType: string;
  location: string;
  scheduledFor: string;
  status: string;
  checklistProgress: string;
  downtime: string;
};

const equipmentReportFields: Array<{ key: keyof EquipmentReportRow; label: string }> = [
  { key: "assetTag", label: "Equipment Tag" },
  { key: "assetType", label: "Asset Type" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "location", label: "Location" },
  { key: "criticality", label: "Criticality" },
  { key: "status", label: "Status" },
];
const planReportFields: Array<{ key: keyof PlanReportRow; label: string }> = [
  { key: "planName", label: "Plan Name" },
  { key: "assetTag", label: "Equipment Tag" },
  { key: "assetType", label: "Asset Type" },
  { key: "repeatInterval", label: "Repeat Interval" },
  { key: "nextDueDate", label: "Next Due Date" },
  { key: "status", label: "Status" },
];
const workOrderReportFields: Array<{ key: keyof WorkOrderReportRow; label: string }> = [
  { key: "assetTag", label: "Equipment Tag" },
  { key: "assetType", label: "Asset Type" },
  { key: "location", label: "Location" },
  { key: "scheduledFor", label: "Scheduled For" },
  { key: "status", label: "Status" },
  { key: "checklistProgress", label: "Checklist" },
  { key: "downtime", label: "Downtime" },
];

const blankDashboard: DashboardData = { assetOptions: [], locations: [], assets: [], plans: [], workOrders: [] };
const defaultChecklistText = [
  "CLEAN EXTERNAL SURFACES USING AN APPROVED SAFE METHOD",
  "VISUALLY CHECK GUARDS, CABLES, LEAKS, AND UNUSUAL NOISE",
  "CHECK LUBRICATION POINTS ONLY AS SPECIFIED BY THE MANUFACTURER",
].join("\n");
const today = new Date().toISOString().slice(0, 10);
const formatDate = (value: string) => new Date(value).toLocaleDateString("en-IN");

export default function PreventiveMaintenancePage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId ?? "";
  const [dashboard, setDashboard] = useState<DashboardData>(blankDashboard);
  const [tab, setTab] = useState<TabValue>("equipment");
  const [formMode, setFormMode] = useState<"equipment" | "plans" | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [equipmentStatus, setEquipmentStatus] = useState("ALL");
  const [planStatus, setPlanStatus] = useState("ALL");
  const [workOrderStatus, setWorkOrderStatus] = useState("ALL");
  const [visibleEquipmentFields, setVisibleEquipmentFields] = useState<Array<keyof EquipmentReportRow | string>>(
    equipmentReportFields.map(({ key }) => key),
  );
  const [visiblePlanFields, setVisiblePlanFields] = useState<Array<keyof PlanReportRow | string>>(
    planReportFields.map(({ key }) => key),
  );
  const [visibleWorkOrderFields, setVisibleWorkOrderFields] = useState<Array<keyof WorkOrderReportRow | string>>(
    workOrderReportFields.map(({ key }) => key),
  );
  const [loading, setLoading] = useState(true);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [masterRawMaterialId, setMasterRawMaterialId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [criticality, setCriticality] = useState("MEDIUM");
  const [planAssetId, setPlanAssetId] = useState("");
  const [planName, setPlanName] = useState("");
  const [intervalDays, setIntervalDays] = useState("30");
  const [nextDueDate, setNextDueDate] = useState(today);
  const [checklistText, setChecklistText] = useState(defaultChecklistText);
  const [downtimeByWorkOrder, setDowntimeByWorkOrder] = useState<Record<string, string>>({});
  const [completionNotesByWorkOrder, setCompletionNotesByWorkOrder] = useState<Record<string, string>>({});
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>({});
  const equipmentRows = useMemo<EquipmentReportRow[]>(() => dashboard.assets.map((asset) => ({
    id: asset.id,
    assetTag: asset.asset_tag,
    assetType: asset.rawMaterial.raw_material_name,
    serialNumber: asset.serial_number ?? "",
    location: asset.location.location_name,
    criticality: asset.criticality,
    status: asset.status,
  })), [dashboard.assets]);
  const planRows = useMemo<PlanReportRow[]>(() => dashboard.plans.map((plan) => ({
    id: plan.id,
    planName: plan.plan_name,
    assetTag: plan.asset.asset_tag,
    assetType: plan.asset.rawMaterial.raw_material_name,
    repeatInterval: `${plan.interval_days} days`,
    nextDueDate: formatDate(plan.next_due_date),
    status: plan.is_active ? "ACTIVE" : "INACTIVE",
  })), [dashboard.plans]);
  const workOrderRows = useMemo<WorkOrderReportRow[]>(() => dashboard.workOrders.map((workOrder) => ({
    id: workOrder.id,
    assetTag: workOrder.asset.asset_tag,
    assetType: workOrder.asset.rawMaterial.raw_material_name,
    location: workOrder.asset.location.location_name,
    scheduledFor: formatDate(workOrder.scheduled_for),
    status: workOrder.status,
    checklistProgress: `${workOrder.checklist.filter((item) => item.is_completed).length}/${workOrder.checklist.length}`,
    downtime: workOrder.downtime_minutes == null ? "—" : `${workOrder.downtime_minutes} min`,
  })), [dashboard.workOrders]);
  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/asset-management/preventive-maintenance?organizationId=${encodeURIComponent(organizationId)}`, {
      cache: "no-store",
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load Preventive Maintenance.");
    setDashboard({
      assetOptions: data.assetOptions ?? [],
      locations: data.locations ?? [],
      assets: data.assets ?? [],
      plans: data.plans ?? [],
      workOrders: data.workOrders ?? [],
    });
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/asset-management/preventive-maintenance?organizationId=${encodeURIComponent(organizationId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Preventive Maintenance.");
        setDashboard({
          assetOptions: data.assetOptions ?? [],
          locations: data.locations ?? [],
          assets: data.assets ?? [],
          plans: data.plans ?? [],
          workOrders: data.workOrders ?? [],
        });
        setDashboardReady(true);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setDashboardReady(false);
          setError(loadError instanceof Error ? loadError.message : "Unable to load Preventive Maintenance.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadRetry, organizationId]);

  const submitAction = async (action: string, values: Record<string, unknown>, successMessage: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/asset-management/preventive-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, ...values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save Preventive Maintenance.");
      setNotice(successMessage);
      try {
        await loadDashboard();
      } catch {
        setError("The change was saved, but the latest dashboard could not be refreshed. Reload the page to see the update.");
      }
      return true;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save Preventive Maintenance.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await submitAction("register-asset", { assetTag, masterRawMaterialId, locationId, serialNumber, criticality }, "Equipment registered.")) {
      setAssetTag("");
      setMasterRawMaterialId("");
      setLocationId("");
      setSerialNumber("");
      setCriticality("MEDIUM");
      setFormMode(null);
      setTab("equipment");
    }
  };

  const submitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const checklist = checklistText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (await submitAction("create-plan", { assetId: planAssetId, name: planName, intervalDays, nextDueDate, checklist }, "Maintenance plan created.")) {
      setPlanAssetId("");
      setPlanName("");
      setIntervalDays("30");
      setNextDueDate(today);
      setChecklistText(defaultChecklistText);
      setFormMode(null);
      setTab("plans");
    }
  };

  const openPlans = useMemo(() => dashboard.plans.filter((plan) => plan.is_active), [dashboard.plans]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-brand)]">Asset Management</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">Preventive Maintenance</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--erp-muted)]">
              A simple TPM routine: clean, inspect, record abnormalities, and follow the equipment manufacturer&apos;s maintenance instructions.
            </p>
          </div>
          <Button
            type="button"
            disabled={saving || loading || openPlans.length === 0}
            onClick={() => void submitAction("generate-due", {}, "Due work orders generated.")}
          >
            Generate Due Work
          </Button>
        </header>

        <Card className="border-[var(--erp-border)] p-4">
          <p className="text-sm font-semibold text-[var(--erp-text)]">Keep the routine safe and practical</p>
          <p className="mt-1 text-sm text-[var(--erp-muted)]">
            Use 5S for a clean, orderly work area; operator-led daily checks for obvious abnormalities; and a planned schedule for trained maintenance staff.
            Follow site lockout/tagout and manufacturer instructions. This checklist is a record, not a substitute for safety procedures or certification.
          </p>
        </Card>

        {error ? (
          <Card role="alert" className="border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              {!dashboardReady ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    setError("");
                    setLoading(true);
                    setLoadRetry((current) => current + 1);
                  }}
                >
                  {loading ? "Retrying..." : "Retry loading"}
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}
        {notice ? <Card role="status" className="border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] p-3 text-sm text-[var(--erp-brand)]">{notice}</Card> : null}

        <Tabs
          ariaLabel="Preventive Maintenance sections"
          value={tab}
          onChange={(value) => {
            setTab(value);
            setError("");
          }}
          tabs={[
            { label: `Equipment (${dashboard.assets.length})`, value: "equipment" },
            { label: `Plans (${dashboard.plans.length})`, value: "plans" },
            { label: `Work Orders (${dashboard.workOrders.filter((workOrder) => workOrder.status !== "COMPLETED").length})`, value: "work-orders" },
          ]}
        />

        {loading && !dashboardReady ? (
          <Card className="p-8 text-center text-sm text-[var(--erp-muted)]">Loading equipment and maintenance schedule...</Card>
        ) : !dashboardReady ? (
          <Card className="p-6 text-sm text-[var(--erp-muted)]">Equipment and maintenance records are unavailable until the dashboard loads.</Card>
        ) : tab === "equipment" ? (
          formMode === "equipment" ? (
            <Card className="space-y-4 p-6">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--erp-text)]">Register Equipment</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">Register a machine against an active asset type and location.</p>
                </div>
                <Button type="button" variant="secondary" onClick={() => setFormMode(null)} disabled={saving}>Back to Equipment</Button>
              </header>
              {dashboard.assetOptions.length === 0 ? (
                <p className="text-sm text-[var(--erp-brand)]">Add and activate an asset-classified item in Master Data before registering equipment.</p>
              ) : dashboard.locations.length === 0 ? (
                <p className="text-sm text-[var(--erp-brand)]">Add an active entity location before registering equipment.</p>
              ) : (
                <form onSubmit={(event) => void submitAsset(event)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Input label="Equipment Tag" value={assetTag} onChange={(event) => setAssetTag(event.target.value)} required maxLength={100} />
                  <Select label="Asset Type" value={masterRawMaterialId} onChange={(event) => setMasterRawMaterialId(event.target.value)} required options={[
                    { value: "", label: "Select asset type" },
                    ...dashboard.assetOptions.map((asset) => ({
                      value: asset.id,
                      label: [asset.raw_material_name, asset.manufacturer, asset.model_number].filter(Boolean).join(" · "),
                    })),
                  ]} />
                  <Select label="Location" value={locationId} onChange={(event) => setLocationId(event.target.value)} required options={[
                    { value: "", label: "Select location" },
                    ...dashboard.locations.map((location) => ({ value: location.id, label: location.location_name })),
                  ]} />
                  <Input label="Serial Number" value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} maxLength={150} />
                  <Select label="Criticality" value={criticality} onChange={(event) => setCriticality(event.target.value)} options={[
                    { value: "LOW", label: "Low" },
                    { value: "MEDIUM", label: "Medium" },
                    { value: "HIGH", label: "High" },
                  ]} />
                  <div className="flex items-end"><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Register Equipment"}</Button></div>
                </form>
              )}
            </Card>
          ) : (
            <ReportGrid
              title="Equipment Register"
              records={equipmentRows.filter((row) => equipmentStatus === "ALL" || row.status === equipmentStatus)}
              fields={equipmentReportFields}
              visibleFields={visibleEquipmentFields}
              onVisibleFieldsChange={setVisibleEquipmentFields}
              storageKey={`credence-craft-pm-equipment-${organizationId}`}
              rowIdSelector={(row) => row.id}
              selectedIds={[]}
              selectable={false}
              statusOptions={["ALL", "ACTIVE", "INACTIVE"]}
              selectedStatus={equipmentStatus}
              onStatusChange={setEquipmentStatus}
              onNewOrder={() => setFormMode("equipment")}
              newActionLabel="Register Equipment"
              renderCell={(fieldKey, row) => String(row[fieldKey as keyof EquipmentReportRow] || "—")}
              emptyMessage="No equipment is registered for this organization."
            />
          )
        ) : tab === "plans" ? (
          formMode === "plans" ? (
            <Card className="space-y-4 p-6">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--erp-text)]">Create a Preventive Maintenance Plan</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">Set an interval, first due date, and approved checklist.</p>
                </div>
                <Button type="button" variant="secondary" onClick={() => setFormMode(null)} disabled={saving}>Back to Plans</Button>
              </header>
              {dashboard.assets.filter((asset) => asset.status === "ACTIVE").length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--erp-brand)]">Register active equipment before creating a maintenance plan.</p>
                  <Button type="button" variant="secondary" onClick={() => { setTab("equipment"); setFormMode("equipment"); }}>Register Equipment</Button>
                </div>
              ) : (
                <form onSubmit={(event) => void submitPlan(event)} className="grid gap-4 sm:grid-cols-2">
                  <Select label="Equipment" value={planAssetId} onChange={(event) => setPlanAssetId(event.target.value)} required options={[
                    { value: "", label: "Select equipment" },
                    ...dashboard.assets.filter((asset) => asset.status === "ACTIVE").map((asset) => ({
                      value: asset.id,
                      label: `${asset.asset_tag} · ${asset.rawMaterial.raw_material_name}`,
                    })),
                  ]} />
                  <Input label="Plan Name" value={planName} onChange={(event) => setPlanName(event.target.value)} required maxLength={120} />
                  <Input label="Repeat Every (Days)" type="number" min="1" max="365" value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} required />
                  <Input label="First Due Date" type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} required />
                  <Textarea label="Checklist (one step per line)" value={checklistText} onChange={(event) => setChecklistText(event.target.value)} rows={5} maxLength={5000} required hint="Use manufacturer-approved checks and site safety procedures. Maximum 20 steps." className="sm:col-span-2" />
                  <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Create Plan"}</Button></div>
                </form>
              )}
            </Card>
          ) : (
            <ReportGrid
              title="Maintenance Plans"
              records={planRows.filter((row) => planStatus === "ALL" || row.status === planStatus)}
              fields={planReportFields}
              visibleFields={visiblePlanFields}
              onVisibleFieldsChange={setVisiblePlanFields}
              storageKey={`credence-craft-pm-plans-${organizationId}`}
              rowIdSelector={(row) => row.id}
              selectedIds={[]}
              selectable={false}
              statusOptions={["ALL", "ACTIVE", "INACTIVE"]}
              selectedStatus={planStatus}
              onStatusChange={setPlanStatus}
              onNewOrder={() => setFormMode("plans")}
              newActionLabel="Create Plan"
              renderCell={(fieldKey, row) => String(row[fieldKey as keyof PlanReportRow] || "—")}
              emptyMessage="No maintenance plans have been created."
            />
          )
        ) : (
          <div className="space-y-4">
            <ReportGrid
              title="Preventive Maintenance Work Orders"
              records={workOrderRows.filter((row) => workOrderStatus === "ALL" || row.status === workOrderStatus)}
              fields={workOrderReportFields}
              visibleFields={visibleWorkOrderFields}
              onVisibleFieldsChange={setVisibleWorkOrderFields}
              storageKey={`credence-craft-pm-work-orders-${organizationId}`}
              rowIdSelector={(row) => row.id}
              selectedIds={selectedWorkOrderId ? [selectedWorkOrderId] : []}
              selectable={false}
              statusOptions={["ALL", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]}
              selectedStatus={workOrderStatus}
              onStatusChange={setWorkOrderStatus}
              onRowAction={setSelectedWorkOrderId}
              rowActionLabel="Manage"
              renderCell={(fieldKey, row) => String(row[fieldKey as keyof WorkOrderReportRow] || "—")}
              emptyMessage="No maintenance work orders have been generated."
            />
            {selectedWorkOrderId ? (() => {
              const workOrder = dashboard.workOrders.find((item) => item.id === selectedWorkOrderId);
              if (!workOrder) return null;
              return (
                <WorkOrderCard
                  workOrder={workOrder}
                  saving={saving}
                  downtime={downtimeByWorkOrder[workOrder.id] ?? "0"}
                  completionNotes={completionNotesByWorkOrder[workOrder.id] ?? ""}
                  checklistNotes={checklistNotes}
                  onDowntimeChange={(value) => setDowntimeByWorkOrder((current) => ({ ...current, [workOrder.id]: value }))}
                  onCompletionNotesChange={(value) => setCompletionNotesByWorkOrder((current) => ({ ...current, [workOrder.id]: value }))}
                  onChecklistNoteChange={(id, value) => setChecklistNotes((current) => ({ ...current, [id]: value }))}
                  onChecklistChange={(item, completed, note) => void submitAction("update-checklist", {
                    workOrderId: workOrder.id,
                    checklistItemId: item.id,
                    completed,
                    note: note ?? checklistNotes[item.id] ?? item.completion_note ?? "",
                  }, "Checklist updated.")}
                  onComplete={() => void submitAction("complete-work-order", {
                    workOrderId: workOrder.id,
                    downtimeMinutes: downtimeByWorkOrder[workOrder.id] ?? "0",
                    completionNotes: completionNotesByWorkOrder[workOrder.id] ?? "",
                  }, "Work order completed and the next due date was scheduled.")}
                />
              );
            })() : null}
            {dashboard.workOrders.length === 100 ? <p className="text-xs text-[var(--erp-muted)]">Showing the latest 100 work orders.</p> : null}
          </div>
        )}
      </Section>
    </Page>
  );
}

function WorkOrderCard({
  workOrder,
  saving,
  downtime,
  completionNotes,
  checklistNotes,
  onDowntimeChange,
  onCompletionNotesChange,
  onChecklistNoteChange,
  onChecklistChange,
  onComplete,
}: {
  workOrder: WorkOrder;
  saving: boolean;
  downtime: string;
  completionNotes: string;
  checklistNotes: Record<string, string>;
  onDowntimeChange: (value: string) => void;
  onCompletionNotesChange: (value: string) => void;
  onChecklistNoteChange: (id: string, value: string) => void;
  onChecklistChange: (item: WorkOrder["checklist"][number], completed: boolean, note?: string) => void;
  onComplete: () => void;
}) {
  const closed = ["COMPLETED", "CANCELLED"].includes(workOrder.status);
  const readyToClose = workOrder.checklist.length > 0 && workOrder.checklist.every((item) => item.is_completed);
  return (
    <Card className="space-y-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-brand)]">{workOrder.asset.asset_tag}</p>
          <h2 className="mt-1 font-semibold text-[var(--erp-text)]">{workOrder.asset.rawMaterial.raw_material_name}</h2>
          <p className="mt-1 text-sm text-[var(--erp-muted)]">{workOrder.asset.location.location_name} · Due {formatDate(workOrder.scheduled_for)}</p>
        </div>
        <Badge>{workOrder.status.replaceAll("_", " ")}</Badge>
      </header>
      <div className="space-y-3">
        {workOrder.checklist.map((item) => (
          <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--erp-border)] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex items-start gap-3 text-sm text-[var(--erp-muted)]">
              <Checkbox
                checked={item.is_completed}
                disabled={saving || closed}
                label={item.instruction}
                aria-label={`Complete ${item.instruction}`}
                onChange={(event) => onChecklistChange(item, event.target.checked)}
                className="mt-0.5 shrink-0"
              />
            </div>
            {item.is_completed ? (
              <Input
                aria-label={`Completion note for ${item.instruction}`}
                value={checklistNotes[item.id] ?? item.completion_note ?? ""}
                onChange={(event) => onChecklistNoteChange(item.id, event.target.value)}
                onBlur={(event) => onChecklistChange(item, true, event.currentTarget.value)}
                disabled={closed}
                placeholder="Optional note"
                className="sm:w-56"
              />
            ) : null}
          </div>
        ))}
      </div>
      {!closed ? (
        <div className="grid gap-4 border-t border-[var(--erp-border)] pt-4 sm:grid-cols-2">
          <Input label="Downtime (Minutes)" type="number" min="0" max="10080" value={downtime} onChange={(event) => onDowntimeChange(event.target.value)} />
          <Textarea label="Findings / Completion Notes" value={completionNotes} onChange={(event) => onCompletionNotesChange(event.target.value)} rows={2} maxLength={1000} />
          <div className="flex justify-end sm:col-span-2">
            <Button type="button" disabled={saving || !readyToClose} onClick={onComplete}>
              {saving ? "Saving..." : "Complete Work Order"}
            </Button>
          </div>
          {!readyToClose ? <p className="text-xs text-[var(--erp-muted)] sm:col-span-2">Complete each safety-approved checklist step before closing this work order.</p> : null}
        </div>
      ) : (
        <p className="border-t border-[var(--erp-border)] pt-3 text-sm text-[var(--erp-muted)]">
          Completed by {workOrder.completed_by ?? "—"} on {workOrder.completed_at ? formatDate(workOrder.completed_at) : "—"} · Downtime {workOrder.downtime_minutes ?? 0} min
        </p>
      )}
    </Card>
  );
}
