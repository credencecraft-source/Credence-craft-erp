"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";

type Receipt = {
  id: string;
  receipt_no: string;
  entity: { entity_name: string } | null;
  location: { location_name: string } | null;
  received_date: string;
  purchaseOrder: { purchase_order_no: string; display_no: number | null };
  lines: Array<{ received_quantity: number | string; accepted_quantity: number | string; rejected_quantity: number | string }>;
};

type ReceiptField = "receipt_no" | "entityName" | "locationName" | "received_date" | "purchase_order_no" | "total_received" | "total_accepted" | "total_rejected";

const reportFields: Array<{ key: ReceiptField; label: string }> = [
  { key: "receipt_no", label: "GRN No" },
  { key: "entityName", label: "Entity" },
  { key: "locationName", label: "Location" },
  { key: "received_date", label: "Received Date" },
  { key: "purchase_order_no", label: "PO No" },
  { key: "total_received", label: "Received Qty" },
  { key: "total_accepted", label: "Accepted Qty" },
  { key: "total_rejected", label: "Rejected Qty" },
];

const number = (value: number | string | null | undefined) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const formatDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-IN") : "To be confirmed");

export default function RmGrnReportPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn`;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleFields, setVisibleFields] = useState<ReceiptField[]>(reportFields.map((field) => field.key));

  useEffect(() => {
    void fetch(`/api/inventory/receipts?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load GRN report.");
        setReceipts(data.receipts ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load GRN report."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const reportRows = useMemo(
    () =>
      receipts.map((receipt) => {
        const totals = receipt.lines.reduce(
          (sum, line) => ({
            received: sum.received + Number(line.received_quantity ?? 0),
            accepted: sum.accepted + Number(line.accepted_quantity ?? 0),
            rejected: sum.rejected + Number(line.rejected_quantity ?? 0),
          }),
          { received: 0, accepted: 0, rejected: 0 },
        );

        return {
          ...receipt,
          entityName: receipt.entity?.entity_name ?? "Missing Entity",
          locationName: receipt.location?.location_name ?? "Location not set",
          purchase_order_no: receipt.purchaseOrder.display_no ? `PO-${receipt.purchaseOrder.display_no}` : receipt.purchaseOrder.purchase_order_no,
          total_received: totals.received,
          total_accepted: totals.accepted,
          total_rejected: totals.rejected,
        };
      }),
    [receipts],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">RM GRN Report</h1>
        </div>

        <Button type="button" variant="primary" size="sm" onClick={() => router.push(`${basePath}/create`)}>
          Create GRN
        </Button>
      </header>

      {loading ? (
        <div className="erp-surface flex min-h-48 items-center justify-center text-sm text-slate-500">Loading GRN report...</div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <ReportGrid
            title="RM GRN Register"
            records={reportRows}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(next) => setVisibleFields(next as ReceiptField[])}
            rowIdSelector={(row) => row.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={(recordId) => router.push(`${basePath}/report/${encodeURIComponent(recordId)}`)}
            renderCell={(fieldKey, row) => {
              switch (fieldKey as ReceiptField) {
                case "receipt_no":
                  return row.receipt_no;
                case "entityName":
                  return row.entityName;
                case "locationName":
                  return row.locationName;
                case "received_date":
                  return formatDate(row.received_date);
                case "purchase_order_no":
                  return row.purchase_order_no;
                case "total_received":
                  return number(row.total_received);
                case "total_accepted":
                  return number(row.total_accepted);
                case "total_rejected":
                  return number(row.total_rejected);
                default:
                  return "";
              }
            }}
            emptyMessage="No raw-material GRN records found."
          />
        </div>
      )}
    </div>
  );
}