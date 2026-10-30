"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ReportGrid } from "@/components/reports/report-grid-display";

type OrderFormRow = {
  id: string;
  orderFormNo: string;
  orderFormDate: string;
  customer: string;
  status: string;
  quotationId: string | null;
  totalQuantity: number;
  subtotal: string;
  createdAt: string;
};

const fields = [
  { key: "orderFormNo" as const, label: "Order Form No" },
  { key: "customer" as const, label: "Customer / Contact" },
  { key: "status" as const, label: "Status" },
  { key: "totalQuantity" as const, label: "Total Qty" },
  { key: "subtotal" as const, label: "Subtotal" },
  { key: "createdAt" as const, label: "Created Date" },
];

export default function OrderFormListPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const [rows, setRows] = useState<OrderFormRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [visibleFields, setVisibleFields] = useState<(typeof fields)[number]["key"][]>(fields.map((field) => field.key));

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/distribution/order-forms?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.orderForms)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load Order Forms.");
      }
      setRows(data.orderForms);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Order Forms.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function createQuotation() {
    if (isCreating || selectedIds.length === 0) return;
    setIsCreating(true);
    setError("");
    try {
      const response = await fetch("/api/distribution/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, orderFormIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.quotation?.id !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to create the Quotation.");
      }
      router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/quotation/${encodeURIComponent(data.quotation.id)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the Quotation.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Card>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Order Form</h1>
            <p className="text-sm text-slate-600">Create a Quotation from one or more Order Forms.</p>
          </div>
          <Button type="button" variant="primary" onClick={() => void createQuotation()} disabled={selectedIds.length === 0 || isCreating}>
            {isCreating ? "Creating Quotation..." : `Create Quotation${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {isLoading ? (
          <p className="text-sm text-slate-600">Loading Order Forms...</p>
        ) : (
          <ReportGrid
            title="Order Forms"
            records={rows.filter((row) => row.status === "DRAFT")}
            fields={fields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(nextFields) => setVisibleFields(nextFields as (typeof fields)[number]["key"][])}
            storageKey="distribution-order-form-list"
            rowIdSelector={(row) => row.id}
            selectedIds={selectedIds}
            selectable
            onToggleSelectAll={(checked, recordIds) => {
              setSelectedIds((current) =>
                checked ? [...new Set([...current, ...recordIds])] : current.filter((id) => !recordIds.includes(id)),
              );
            }}
            onToggleRowSelection={(recordId, checked) => {
              setSelectedIds((current) =>
                checked ? [...new Set([...current, recordId])] : current.filter((id) => id !== recordId),
              );
            }}
            renderCell={(field, row) => {
              if (field === "createdAt") return row.createdAt.slice(0, 10);
              const value = row[field as keyof OrderFormRow];
              return value === null || value === undefined ? "" : String(value);
            }}
            isLoading={isLoading}
            emptyMessage="No draft Order Forms found."
          />
        )}
      </div>
    </Card>
  );
}
