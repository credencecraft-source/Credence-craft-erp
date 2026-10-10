"use client";

import { useEffect, useState, startTransition, useCallback } from "react";
import { useRouter } from "next/navigation";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ReportGrid } from "@/components/reports/report-grid-display";

type BomReportRow = {
  id: string;
  orderId: string;
  orderNo: string;
  orderQty?: number | string | null;
  styleName?: string | null;
  brand?: string | null;
  buyer?: string | null;
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  stockUom?: string | null;
  size?: string | null;
  consumption?: number | string | null;
  buyerConsumption?: number | string | null;
  buyerPrice?: number | string | null;
  internalConsumption?: number | string | null;
  internalPrice?: number | string | null;
  valuePerGarmentRm?: number | string | null;
  requiredQty?: number | string | null;
  itemWiseExcessPercentage?: number | string | null;
  itemWiseExcessQty?: number | string | null;
  totalRequiredQty?: number | string | null;
};

type BomReportPage = {
  bomItems: BomReportRow[];
  nextCursor: string | null;
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
  | "stockUom"
  | "size"
  | "consumption"
  | "buyerConsumption"
  | "buyerPrice"
  | "internalConsumption"
  | "internalPrice"
  | "valuePerGarmentRm"
  | "requiredQty"
  | "orderQty"
  | "itemWiseExcessPercentage"
  | "itemWiseExcessQty"
  | "totalRequiredQty";

const reportFilterFields: Array<{ key: FilterableBomField; label: string }> = [
  { key: "orderNo", label: "Order No" },
  { key: "styleName", label: "Style Name" },
  { key: "brand", label: "Brand" },
  { key: "buyer", label: "Buyer" },
  { key: "categoryType", label: "Raw Material Type" },
  { key: "category", label: "Raw Material Category" },
  { key: "subCategory", label: "Raw Material Sub Category" },
  { key: "rawMaterialName", label: "Raw Material Name" },
  { key: "stockUom", label: "Stock UOM" },
  { key: "size", label: "Size" },
  { key: "consumption", label: "Consumption" },
  { key: "buyerConsumption", label: "Buyer Consumption" },
  { key: "buyerPrice", label: "Buyer Price" },
  { key: "internalConsumption", label: "Internal Consumption" },
  { key: "internalPrice", label: "Internal Price" },
  { key: "valuePerGarmentRm", label: "Value / Garment" },
  { key: "requiredQty", label: "Required Qty" },
  { key: "orderQty", label: "Order Qty" },
  { key: "itemWiseExcessPercentage", label: "Item Excess %" },
  { key: "itemWiseExcessQty", label: "Item Excess Qty" },
  { key: "totalRequiredQty", label: "Total Required Qty" },
];

function getBomRowId(row: BomReportRow) {
  return row.id;
}

function renderBomCell(fieldKey: string, row: BomReportRow) {
  const value = row[fieldKey as keyof BomReportRow];
  return value !== null && value !== undefined ? String(value) : "";
}

export default function MerchandisingBomReportPage({
  organizationId,
  workspaceId,
  initialPage,
}: {
  organizationId: string;
  workspaceId: string;
  initialPage: BomReportPage;
}) {
  const router = useRouter();
  const [bomItems, setBomItems] = useState(initialPage.bomItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleReportFields, setVisibleReportFields] = useState<FilterableBomField[]>(
    reportFilterFields.map((field) => field.key),
  );

  const loadBomItems = useCallback(async (cursor?: string) => {
    try {
      setLoadError(null);
      if (cursor) setLoadingMore(true);
      else setRefreshing(true);
      const response = await fetch(
        `/api/orders/bom?organizationId=${encodeURIComponent(organizationId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store" },
      );
      const data = await response.json() as BomReportPage;
      if (!response.ok) throw new Error("Unable to load BOM report. Please try again.");
      setBomItems((current) => cursor ? [...current, ...(data?.bomItems ?? [])] : (data?.bomItems ?? []));
      setNextCursor(data?.nextCursor ?? null);
    } catch (error) {
      console.error("Unable to load BOM report", error);
      setLoadError("Unable to load BOM report. Please try again.");
    } finally {
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const handleFocus = () => {
      void loadBomItems();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadBomItems]);

  const records = bomItems;

  const handleToggleSelection = useCallback((rowId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        if (current.includes(rowId)) return current;
        return [...current, rowId];
      }
      return current.filter((id) => id !== rowId);
    });
  }, []);

  const handleToggleSelectAll = useCallback((checked: boolean) => {
    setSelectedIds(checked ? records.map((row) => row.id) : []);
  }, [records]);

  const openOrder = useCallback((row: BomReportRow) => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${row.orderId}`,
      );
    });
  }, [organizationId, router, workspaceId]);

  const handleRowClick = useCallback((rowId: string) => {
    const matched = records.find((row) => row.id === rowId);
    if (matched) openOrder(matched);
  }, [openOrder, records]);

  const handleVisibleFieldsChange = useCallback((fields: (keyof BomReportRow | string)[]) => {
    setVisibleReportFields(fields as FilterableBomField[]);
  }, []);

  return (
    <div className="space-y-3 text-[11px]">
      <Card className="p-3 shadow-none border-slate-200">
        <ReportGrid
          title="BOM Report"
          records={records}
          isLoading={refreshing}
          fields={reportFilterFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={handleVisibleFieldsChange}
          storageKey={`credence-craft-bom-${organizationId}`}
          rowIdSelector={getBomRowId}
          selectedIds={selectedIds}
          onRowClick={handleRowClick}
          onToggleSelectAll={handleToggleSelectAll}
          onToggleRowSelection={handleToggleSelection}
          renderCell={renderBomCell}
        />
      </Card>
      {loadError && <p role="alert" aria-live="polite" className="text-sm">{loadError}</p>}
      {nextCursor && (
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => void loadBomItems(nextCursor)}
          disabled={loadingMore || refreshing}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          {loadingMore ? "Loading..." : "Load more BOM rows"}
        </Button>
      )}
    </div>
  );
}
