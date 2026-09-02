"use client";

import { useEffect, useMemo, useState, startTransition, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

import Card from "@/components/ui/Card";
import { ReportGrid } from "@/components/reports/report-grid-display";

type BomReportRow = {
  id: string;
  orderId: string;
  orderNo: string;
  styleName?: string | null;
  brand?: string | null;
  buyer?: string | null;
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  size?: string | null;
  consumption?: number | string | null;
  requiredQty?: number | string | null;
};

type FilterableBomField =
  | "orderNo"
  | "styleName"
  | "brand"
  | "buyer"
  | "categoryType"
  | "category"
  | "subCategory"
  | "rawMaterialName"
  | "size"
  | "consumption"
  | "requiredQty";

const reportFilterFields: Array<{ key: FilterableBomField; label: string }> = [
  { key: "orderNo", label: "Order No" },
  { key: "styleName", label: "Style Name" },
  { key: "brand", label: "Brand" },
  { key: "buyer", label: "Buyer" },
  { key: "categoryType", label: "Raw Material Type" },
  { key: "category", label: "Raw Material Category" },
  { key: "subCategory", label: "Raw Material Sub Category" },
  { key: "rawMaterialName", label: "Raw Material Name" },
  { key: "size", label: "Size" },
  { key: "consumption", label: "Consumption" },
  { key: "requiredQty", label: "Required Qty" },
];

export default function MerchandisingBomReportPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();

  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";

  const [bomItems, setBomItems] = useState<BomReportRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleReportFields, setVisibleReportFields] = useState<FilterableBomField[]>(
    reportFilterFields.map((field) => field.key),
  );

  const loadBomItems = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/orders/bom?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      setBomItems(data?.bomItems ?? []);
    } catch (error) {
      console.error("Unable to load BOM report", error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadBomItems();

    const handleFocus = () => {
      loadBomItems();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadBomItems]);

  const records = useMemo(() => bomItems, [bomItems]);

  const handleToggleSelection = (rowId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        if (current.includes(rowId)) return current;
        return [...current, rowId];
      }
      return current.filter((id) => id !== rowId);
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? records.map((row) => row.id) : []);
  };

  const openOrder = (row: BomReportRow) => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${row.orderId}`,
      );
    });
  };

  return (
    <div className="space-y-3 text-[11px]">
      <Card className="p-3 shadow-none border-slate-200">
        <ReportGrid
          title="BOM Report"
          records={records}
          fields={reportFilterFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={(fields) => setVisibleReportFields(fields as FilterableBomField[])}
          storageKey={`credence-craft-bom-${organizationId}`}
          rowIdSelector={(row) => row.id}
          selectedIds={selectedIds}
          onRowClick={(rowId) => {
            const matched = records.find((row) => row.id === rowId);
            if (matched) openOrder(matched);
          }}
          onToggleSelectAll={handleToggleSelectAll}
          onToggleRowSelection={handleToggleSelection}
          renderCell={(fieldKey, row) => {
            const val = row[fieldKey as keyof BomReportRow];
            return val !== null && val !== undefined ? String(val) : "";
          }}
        />
      </Card>
    </div>
  );
}
