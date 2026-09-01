"use client";

import { useEffect, useMemo, useState, startTransition, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ReportGrid } from "@/components/reports/report-grid-display";

type OrderRecord = {
  id: string;
  orderNo: string;
  entityName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  season?: string | null;
  article?: string | null;
  styleName?: string | null;
  colors?: string | null;
  buyer?: string | null;
  brand?: string | null;
  sizeGroup?: string | null;
  orderQty?: number | null;
  deliveryDate?: string | null;
  finalStatus: string;
  processStatus?: string | null;
};

type FilterableOrderField =
  | "orderNo"
  | "entityName"
  | "category"
  | "subCategory"
  | "season"
  | "article"
  | "styleName"
  | "colors"
  | "buyer"
  | "brand"
  | "sizeGroup"
  | "orderQty"
  | "deliveryDate"
  | "processStatus"
  | "finalStatus";

const reportFilterFields: Array<{
  key: FilterableOrderField;
  label: string;
}> = [
  { key: "orderNo", label: "Order No" },
  { key: "entityName", label: "Entity Name" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub Category" },
  { key: "season", label: "Season" },
  { key: "article", label: "Article" },
  { key: "styleName", label: "Style Name" },
  { key: "colors", label: "Colors" },
  { key: "buyer", label: "Buyer" },
  { key: "brand", label: "Brand" },
  { key: "sizeGroup", label: "Size Group" },
  { key: "orderQty", label: "Order Qty" },
  { key: "deliveryDate", label: "Delivery Date" },
  { key: "processStatus", label: "Process Status" },
  { key: "finalStatus", label: "Final Status" },
];

const dsStatusOptions = [
  "Draft",
  "Waiting For Approval",
  "Approved",
  "Waiting For Production Schedule",
  "Work Order",
  "Shipped",
  "Closed",
] as const;

export default function MerchandisingOrdersPage() {
  const params = useParams<{
    workspaceId: string;
    organizationId: string;
  }>();

  const router = useRouter();

  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedStatus, setSelectedStatus] =
    useState<(typeof dsStatusOptions)[number]>("Draft");

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [visibleReportFields, setVisibleReportFields] = useState<FilterableOrderField[]>(
    reportFilterFields.map((field) => field.key),
  );

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/orders?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      setOrders(data?.orders ?? []);
    } catch (error) {
      console.error("Unable to load orders", error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadOrders();

    const handleFocus = () => {
      loadOrders();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadOrders]);

  useEffect(() => {
    loadOrders();
  }, [selectedStatus, loadOrders]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return selectedStatus === "Draft"
      ? orders.filter((order) => order.finalStatus === "Draft")
      : orders.filter((order) => order.finalStatus === selectedStatus);
  }, [orders, selectedStatus]);

  const handleSelectOrder = (orderId: string) => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${orderId}`,
      );
    });
  };

  const handleToggleOrderSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        if (current.includes(orderId)) return current;
        return [...current, orderId];
      }
      return current.filter((id) => id !== orderId);
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(filteredOrders.map((order) => order.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleNewOrder = () => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/create`,
      );
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <ReportGrid
          title="Orders List"
          records={filteredOrders}
          fields={reportFilterFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={(fields) => setVisibleReportFields(fields as FilterableOrderField[])}
          storageKey={`credence-craft-orders-${organizationId}`}
          rowIdSelector={(order) => order.id}
          selectedIds={selectedOrderIds}
          onRowClick={(rowIdOrName) => {
            const matchedOrder = filteredOrders.find(
              (o) => o.id === rowIdOrName || o.orderNo === rowIdOrName
            );
            if (matchedOrder) {
              handleSelectOrder(matchedOrder.id);
            } else {
              handleSelectOrder(rowIdOrName);
            }
          }}
          onToggleSelectAll={handleToggleSelectAll}
          onToggleRowSelection={handleToggleOrderSelection}
          statusOptions={dsStatusOptions}
          selectedStatus={selectedStatus}
          onStatusChange={(status) => setSelectedStatus(status as any)}
          onNewOrder={handleNewOrder}
          renderCell={(fieldKey, order) => {
            const val = order[fieldKey as keyof OrderRecord];
            return val !== null && val !== undefined ? String(val) : "";
          }}
        />
      </Card>
    </div>
  );
}
