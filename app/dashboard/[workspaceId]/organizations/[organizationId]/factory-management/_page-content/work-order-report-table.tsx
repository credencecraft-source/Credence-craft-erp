"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Card from "@/components/ui/Card";
import { ReportGrid } from "@/components/reports/report-grid-display";

type WorkOrderReport = {
  id: string;
  workOrderNo: string;
  orderNo: string;
  article: string | null;
  styleName: string | null;
  totalQty: number;
  status: string;
  createdAt: string;
  sizeLines: Array<{ size: string; quantity: number }>;
};

type WorkOrderField = "workOrderNo" | "orderNo" | "article" | "styleName" | "sizeQuantities" | "totalQty" | "createdAt" | "status";

const reportFields: Array<{ key: WorkOrderField; label: string }> = [
  { key: "workOrderNo", label: "Work Order No" },
  { key: "orderNo", label: "Order No" },
  { key: "article", label: "Article" },
  { key: "styleName", label: "Style Name" },
  { key: "sizeQuantities", label: "Size Quantities" },
  { key: "totalQty", label: "Total Qty" },
  { key: "createdAt", label: "Created Date" },
  { key: "status", label: "Status" },
];

export default function WorkOrderReportTable() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "demo-org";
  const workspaceId = params?.workspaceId ?? "demo";
  const [records, setRecords] = useState<WorkOrderReport[]>([]);
  const [visibleFields, setVisibleFields] = useState<WorkOrderField[]>(reportFields.map((field) => field.key));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active) setRecords(data.workOrders ?? []);
      })
      .catch(() => {
        if (active) setRecords([]);
      });
    return () => { active = false; };
  }, [organizationId]);

  const reportRows = useMemo(() => records.map((record) => ({
    ...record,
    sizeQuantities: record.sizeLines.map((line) => `${line.size}: ${line.quantity.toLocaleString("en-IN")}`).join(" | "),
  })), [records]);

  return (
    <Card className="p-3 shadow-none border-slate-200">
      <ReportGrid
        title="Work Orders"
        records={reportRows}
        fields={reportFields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={(fields) => setVisibleFields(fields as WorkOrderField[])}
        storageKey={`credence-craft-work-orders-${organizationId}`}
        rowIdSelector={(row) => row.id}
        selectedIds={selectedIds}
        onRowClick={() => undefined}
        onToggleSelectAll={(checked) => setSelectedIds(checked ? reportRows.map((row) => row.id) : [])}
        onToggleRowSelection={(id, checked) => setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))}
        onNewOrder={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/create`)}
        renderCell={(fieldKey, row) => fieldKey === "createdAt" ? new Date(row.createdAt).toLocaleDateString("en-IN") : fieldKey === "totalQty" ? row.totalQty.toLocaleString("en-IN") : String(row[fieldKey as keyof typeof row] ?? "")}
        emptyMessage="No work orders have been created yet."
      />
    </Card>
  );
}
