"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  createOrAssignUniformMeasurementGroupAction,
  deleteUniformMeasurementGroupAction,
} from "../actions";

type PersonRecord = {
  id: string;
  participant_code: string;
  full_name: string;
  group_label: string | null;
  created_at: Date;
};

type StyleRecord = {
  id: string;
  article: string;
  article_code: string | null;
  variants: Array<{ id: string }>;
  sizes: Array<{ size: { id: string; size: string; is_active: boolean } }>;
};

const EMPTY_FIELDS: string[] = [];

export function UniformPeopleReport({
  organizationId,
  workspaceId,
  records,
}: {
  organizationId: string;
  workspaceId: string;
  records: PersonRecord[];
}) {
  const router = useRouter();
  const [visibleFields, setVisibleFields] = useState<(keyof PersonRecord | string)[]>([
    "participant_code",
    "full_name",
    "group_label",
    "created_at",
  ]);
  const fields = useMemo(() => [
    { key: "participant_code", label: "Person ID" },
    { key: "full_name", label: "Name" },
    { key: "group_label", label: "Group / Department" },
    { key: "created_at", label: "Added" },
  ], []);
  return (
    <ReportGrid
      title="People"
      records={records}
      fields={fields}
      visibleFields={visibleFields}
      onVisibleFieldsChange={setVisibleFields}
      storageKey={`uniform-management:${organizationId}:people:columns`}
      rowIdSelector={(record) => record.id}
      selectedIds={EMPTY_FIELDS}
      selectable={false}
      onRecordClick={(record) => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/people/${record.id}`)}
      onNewOrder={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/people/new`)}
      newActionLabel="Add person"
      renderCell={(fieldKey, record) => {
        if (fieldKey === "created_at") return record.created_at.toLocaleDateString();
        return String(record[fieldKey as keyof PersonRecord] ?? "—");
      }}
      emptyMessage="No people have been added yet."
    />
  );
}

export function UniformStylesReport({
  organizationId,
  workspaceId,
  records,
}: {
  organizationId: string;
  workspaceId: string;
  records: StyleRecord[];
}) {
  const router = useRouter();
  const [visibleFields, setVisibleFields] = useState<(keyof StyleRecord | string)[]>([
    "article_code",
    "article",
    "variants",
    "sizes",
  ]);
  const fields = useMemo(() => [
    { key: "article_code", label: "Style Code" },
    { key: "article", label: "Style" },
    { key: "variants", label: "Colors" },
    { key: "sizes", label: "Sizes" },
  ], []);
  return (
    <ReportGrid
      title="Uniform Styles"
      records={records}
      fields={fields}
      visibleFields={visibleFields}
      onVisibleFieldsChange={setVisibleFields}
      storageKey={`uniform-management:${organizationId}:styles:columns`}
      rowIdSelector={(record) => record.id}
      selectedIds={EMPTY_FIELDS}
      selectable={false}
      onRecordClick={(record) => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/styles/${record.id}`)}
      onNewOrder={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/create?source=uniform-management`)}
      newActionLabel="Create Style from Article"
      renderCell={(fieldKey, record) => {
        if (fieldKey === "article_code") return record.article_code || "—";
        if (fieldKey === "variants") return record.variants.length;
        if (fieldKey === "sizes") return record.sizes.filter(({ size }) => size.is_active).length;
        return String(record[fieldKey as keyof StyleRecord] ?? "—");
      }}
      emptyMessage="No active Articles are available as uniform styles. Create one through the Article master."
    />
  );
}

type EmployeeMeasurementRecord = {
  id: string;
  measurement_no: string;
  status: string;
  fit_status: string;
  created_at: Date;
  participant: { participant_code: string; full_name: string };
  category: { category_name: string };
  sub_category: { sub_category: string };
  style: { article: string };
  measurement_chart: { measurement_chart: string };
  size: { size: string } | null;
  _count: { details: number };
};

export function UniformEmployeeMeasurementsReport({
  organizationId,
  workspaceId,
  records,
  groups,
}: {
  organizationId: string;
  workspaceId: string;
  records: EmployeeMeasurementRecord[];
  groups: Array<{ id: string; group_name: string; _count: { measurements: number } }>;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<"create" | "assign">("assign");
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [groupError, setGroupError] = useState("");
  const [isGrouping, startGrouping] = useTransition();
  const [visibleFields, setVisibleFields] = useState<(keyof EmployeeMeasurementRecord | string)[]>([
    "measurement_no", "participant", "category", "sub_category", "style", "measurement_chart", "size", "status", "approval_status", "created_at",
  ]);
  const fields = useMemo(() => [
    { key: "measurement_no", label: "ID" },
    { key: "participant", label: "Employee Name" },
    { key: "category", label: "Product Category" },
    { key: "sub_category", label: "Subcategory" },
    { key: "style", label: "Style" },
    { key: "measurement_chart", label: "Measurement Chart" },
    { key: "size", label: "Size" },
    { key: "status", label: "Fit Status" },
    { key: "approval_status", label: "Status" },
    { key: "created_at", label: "Created" },
  ], []);
  const [selectedFitStatus, setSelectedFitStatus] = useState("All");
  const reportRecords = useMemo(() => records.map((record) => ({ ...record, approval_status: record.status, status: record.fit_status })), [records]);
  const filteredRecords = useMemo(() => selectedFitStatus === "All" ? reportRecords : reportRecords.filter((record) => record.status === selectedFitStatus), [reportRecords, selectedFitStatus]);
  function updateSelection(id: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? current.includes(id) ? current : [...current, id]
      : current.filter((selectedId) => selectedId !== id));
  }
  function submitGroupAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGroupError("");
    startGrouping(async () => {
      const result = await createOrAssignUniformMeasurementGroupAction(
        workspaceId,
        organizationId,
        selectedIds,
        groupMode,
        groupName,
        groupId,
      );
      if (result.error) {
        setGroupError(result.error);
        return;
      }
      setSelectedIds([]);
      setGroupName("");
      setGroupModalOpen(false);
      router.refresh();
    });
  }
  return (
    <>
      <ReportGrid
        title="Employee Measurements"
        records={filteredRecords}
        fields={fields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={setVisibleFields}
        storageKey={`uniform-management:${organizationId}:employee-measurements:columns`}
        rowIdSelector={(record) => record.id}
        selectedIds={selectedIds}
        selectable
        onToggleSelectAll={(checked, ids) => setSelectedIds((current) => checked
          ? [...new Set([...current, ...ids])]
          : current.filter((id) => !ids.includes(id)))}
        onToggleRowSelection={updateSelection}
        onRecordClick={(record) => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements/${record.id}`)}
        onNewOrder={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements/new`)}
        newActionLabel="New Employee Measurement"
        toolbarActions={<Button size="sm" variant="secondary" disabled={selectedIds.length === 0} onClick={() => {
          setGroupError("");
          setGroupModalOpen(true);
        }}>Group selected ({selectedIds.length})</Button>}
        statusOptions={["All", "Perfect Fit", "Mismatch"]}
        selectedStatus={selectedFitStatus}
        onStatusChange={setSelectedFitStatus}
        renderCell={(fieldKey, record) => {
          if (fieldKey === "participant") return `${record.participant.full_name} (${record.participant.participant_code})`;
          if (fieldKey === "category") return record.category.category_name;
          if (fieldKey === "sub_category") return record.sub_category.sub_category;
          if (fieldKey === "style") return record.style.article;
          if (fieldKey === "measurement_chart") return record.measurement_chart.measurement_chart;
          if (fieldKey === "size") return record.size?.size ?? "Per-area mapping";
          if (fieldKey === "status") return <Badge>{record.status}</Badge>;
          if (fieldKey === "approval_status") return <Badge>{record.approval_status}</Badge>;
          if (fieldKey === "created_at") return record.created_at.toLocaleDateString();
          return String(record[fieldKey as keyof EmployeeMeasurementRecord] ?? "?");
        }}
        emptyMessage="No employee measurements yet. Create a record to capture a person, style, chart, size, and measurement rows."
      />
      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        ariaLabelledBy="measurement-group-dialog-title"
        size="square"
      >
        <form onSubmit={submitGroupAssignment} className="space-y-5 p-6">
          <div>
            <h2 id="measurement-group-dialog-title" className="text-lg font-semibold text-[var(--erp-text)]">Group selected measurements</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">{selectedIds.length} measurement{selectedIds.length === 1 ? "" : "s"} selected.</p>
          </div>
          <Select
            label="Action"
            value={groupMode}
            onChange={(event) => setGroupMode(event.target.value as "create" | "assign")}
            options={[
              { value: "assign", label: "Assign to an existing group" },
              { value: "create", label: "Create a named group" },
            ]}
          />
          {groupMode === "create" ? (
            <Input
              label="Group name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              maxLength={255}
              required
              autoComplete="off"
            />
          ) : groups.length > 0 ? (
            <Select
              label="Existing group"
              value={groups.some((group) => group.id === groupId) ? groupId : groups[0]?.id ?? ""}
              onChange={(event) => setGroupId(event.target.value)}
              options={groups.map((group) => ({ value: group.id, label: group.group_name }))}
              required
            />
          ) : (
            <p className="rounded-lg bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-muted)]">
              No groups exist yet. Choose “Create a named group” to continue.
            </p>
          )}
          {groupError ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{groupError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setGroupModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isGrouping || selectedIds.length === 0 || (groupMode === "assign" && groups.length === 0)}>
              {isGrouping ? "Saving..." : groupMode === "create" ? "Create group and assign" : "Assign to group"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

type MeasurementGroupRecord = {
  id: string;
  group_name: string;
  created_at: Date;
  _count: { measurements: number };
};

export function UniformMeasurementGroupsReport({
  organizationId,
  workspaceId,
  records,
}: {
  organizationId: string;
  workspaceId: string;
  records: MeasurementGroupRecord[];
}) {
  const router = useRouter();
  const [visibleFields, setVisibleFields] = useState<(keyof MeasurementGroupRecord | string)[]>([
    "group_name", "measurement_count", "created_at",
  ]);
  const [pendingDelete, setPendingDelete] = useState<MeasurementGroupRecord | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, startDeleting] = useTransition();
  const fields = useMemo(() => [
    { key: "group_name", label: "Group name" },
    { key: "measurement_count", label: "Measurements" },
    { key: "created_at", label: "Created" },
  ], []);
  function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError("");
    startDeleting(async () => {
      const result = await deleteUniformMeasurementGroupAction(workspaceId, organizationId, pendingDelete.id);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setPendingDelete(null);
      router.refresh();
    });
  }
  return (
    <>
      <ReportGrid
        title="Grouped Measurements"
        records={records}
        fields={fields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={setVisibleFields}
        storageKey={`uniform-management:${organizationId}:measurement-groups:columns`}
        rowIdSelector={(record) => record.id}
        selectedIds={EMPTY_FIELDS}
        selectable={false}
        onRecordClick={(record) => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/grouped-measurements/${record.id}`)}
        rowActions={(record) => (
          <Button
            variant="destructive"
            size="sm"
            aria-label={`Delete ${record.group_name}`}
            onClick={() => {
              setDeleteError("");
              setPendingDelete(record);
            }}
          >
            Delete
          </Button>
        )}
        renderCell={(fieldKey, record) => {
          if (fieldKey === "measurement_count") return record._count.measurements;
          if (fieldKey === "created_at") return record.created_at.toLocaleDateString();
          return String(record[fieldKey as keyof MeasurementGroupRecord] ?? "—");
        }}
        emptyMessage="No measurement groups yet. Select measurements in the Employee Measurements report and use Group selected."
      />
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        ariaLabelledBy="delete-measurement-group-title"
        variant="danger"
        size="square"
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="delete-measurement-group-title" className="text-lg font-semibold text-[var(--erp-text)]">Delete measurement group?</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {pendingDelete ? `“${pendingDelete.group_name}” and its group membership will be removed. Its ${pendingDelete._count.measurements} measurement record(s) will be preserved and ungrouped.` : ""}
            </p>
          </div>
          {deleteError ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{deleteError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={isDeleting} onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={isDeleting || pendingDelete === null} onClick={confirmDelete}>
              {isDeleting ? "Deleting..." : "Delete group and ungroup records"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
