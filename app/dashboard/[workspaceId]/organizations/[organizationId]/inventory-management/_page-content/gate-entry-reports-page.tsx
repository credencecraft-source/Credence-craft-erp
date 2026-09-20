"use client";

import { Download, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";

type Entry = {
  id: string;
  entry_no: string;
  direction: string;
  movement_type: string;
  challan_no: string | null;
  person_name: string;
  company_name: string | null;
  vehicle_number: string | null;
  entry_at: string;
  status: string;
};

type GateEntryField = "entry_no" | "direction" | "movement_type" | "person_name" | "company_name" | "challan_no" | "vehicle_number" | "entry_at" | "status";

const reportFields: Array<{ key: GateEntryField; label: string }> = [
  { key: "entry_no", label: "Entry No" },
  { key: "direction", label: "Direction" },
  { key: "movement_type", label: "Movement Type" },
  { key: "person_name", label: "Person / Party" },
  { key: "company_name", label: "Company" },
  { key: "challan_no", label: "Challan" },
  { key: "vehicle_number", label: "Vehicle" },
  { key: "entry_at", label: "Date" },
  { key: "status", label: "Status" },
];

export default function GateEntryReportsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId ?? "";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [direction, setDirection] = useState("ALL");
  const [movementType, setMovementType] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<GateEntryField[]>(reportFields.map((field) => field.key));
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/inventory/gate-entries?organizationId=${encodeURIComponent(organizationId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to delete selected gate entries.");

      setEntries((current) => current.filter((entry) => !selectedIds.includes(entry.id)));
      setSelectedIds([]);
      setShowDeleteConfirmation(false);
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : "Unable to delete selected gate entries.");
    } finally {
      setIsDeleting(false);
    }
  }, [organizationId, selectedIds]);

  const load = useCallback(
    () =>
      fetch(`/api/inventory/gate-entries?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || "Unable to load reports.");
          setEntries(data.entries ?? []);
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load reports."))
        .finally(() => setLoading(false)),
    [organizationId],
  );

  useEffect(() => {
    if (organizationId) void load();
  }, [organizationId, load]);

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (direction === "ALL" || entry.direction === direction) &&
          (movementType === "ALL" || entry.movement_type === movementType),
      ),
    [entries, direction, movementType],
  );

  const exportCsv = () => {
    const rows = [
      ["Entry No", "Direction", "Type", "Person / Party", "Company", "Challan", "Vehicle", "Date", "Status"],
      ...filteredEntries.map((entry) => [
        entry.entry_no,
        entry.direction,
        entry.movement_type,
        entry.person_name,
        entry.company_name || "",
        entry.challan_no || "",
        entry.vehicle_number || "",
        new Date(entry.entry_at).toLocaleString("en-IN"),
        entry.status,
      ]),
    ];

    const blob = new Blob(
      [rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gate-entry-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="erp-eyebrow">Inventory / Gate Control</p>
          <h1 className="erp-page-heading mt-1">Gate Entry Reports</h1>
          <p className="mt-2 text-sm text-slate-500">Review, filter, and export the centralized inward and outward movement register.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="md" onClick={() => void load()} className="gap-2">
            <RefreshCw size={15} />
            Refresh
          </Button>
          <Button type="button" variant="primary" size="md" onClick={exportCsv} className="gap-2">
            <Download size={15} />
            Export CSV
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="erp-surface p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Total records</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{filteredEntries.length}</p>
        </div>
        <div className="erp-surface p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Inward</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{filteredEntries.filter((entry) => entry.direction === "INWARD").length}</p>
        </div>
        <div className="erp-surface p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Outward</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{filteredEntries.filter((entry) => entry.direction === "OUTWARD").length}</p>
        </div>
      </section>

      <section className="erp-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
        <Select label="Direction" value={direction} onChange={(event) => setDirection(event.target.value)} options={[{ value: "ALL", label: "All" }, { value: "INWARD", label: "Inward" }, { value: "OUTWARD", label: "Outward" }]} className="sm:max-w-xs" />
        <Select label="Movement type" value={movementType} onChange={(event) => setMovementType(event.target.value)} options={[{ value: "ALL", label: "All" }, { value: "GRN", label: "GRN" }, { value: "DC", label: "DC" }, { value: "RETURNABLE_DC", label: "Returnable DC" }]} className="sm:max-w-xs" />
      </section>

      <div className="erp-surface overflow-hidden">
        <ReportGrid
          title="Gate Entry Register"
          records={filteredEntries}
          fields={reportFields}
          visibleFields={visibleFields}
          onVisibleFieldsChange={(next) => setVisibleFields(next as GateEntryField[])}
          rowIdSelector={(row) => row.id}
          selectedIds={selectedIds}
          onRowClick={() => undefined}
          onToggleSelectAll={(checked) => setSelectedIds(checked ? filteredEntries.map((row) => row.id) : [])}
          onToggleRowSelection={(recordId, checked) =>
            setSelectedIds((current) => (checked ? [...new Set([...current, recordId])] : current.filter((id) => id !== recordId)))
          }
          onDeleteSelected={() => setShowDeleteConfirmation(true)}
          renderCell={(fieldKey, row) => {
            switch (fieldKey as GateEntryField) {
              case "entry_no":
                return row.entry_no;
              case "direction":
                return row.direction;
              case "movement_type":
                return row.movement_type;
              case "person_name":
                return row.person_name;
              case "company_name":
                return row.company_name ?? "";
              case "challan_no":
                return row.challan_no ?? "";
              case "vehicle_number":
                return row.vehicle_number ?? "";
              case "entry_at":
                return new Date(row.entry_at).toLocaleDateString("en-IN");
              case "status":
                return row.status;
              default:
                return "";
            }
          }}
          emptyMessage="No gate entries match the selected filters."
        />
      </div>

      {showDeleteConfirmation && (
        <Modal open={showDeleteConfirmation} onClose={() => setShowDeleteConfirmation(false)} ariaLabel="Delete selected gate entries" variant="danger" size="sm" className="p-5">
          <div className="space-y-4">
            <div>
              <h3 id="delete-gate-entries-title" className="text-base font-bold text-slate-900">Delete selected gate entries?</h3>
              <p className="mt-1 text-xs text-slate-500">This will permanently delete {selectedIds.length} selected record{selectedIds.length === 1 ? "" : "s"} from the gate register.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowDeleteConfirmation(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={() => void handleDeleteSelected()} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete Entries"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}