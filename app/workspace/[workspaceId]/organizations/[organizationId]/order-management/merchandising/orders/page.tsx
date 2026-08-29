"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { ReportGrid } from "@/components/report-grid";

type FinishedGoodsRow = {
  id?: string;
  buyerSize: string;
  size: string;
  beforeExcessQty: string;
  excess: string;
  excessQty: string;
  totalQty: string;
  buyerPoPrice: string;
  exchangePrice: string;
  priceInInr: string;
};

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
  finishedGoods?: Array<{
    id?: string;
    buyerSize?: string | null;
    size?: string | null;
    beforeExcessQty?: number | null;
    excess?: number | string | null;
    excessQty?: number | null;
    totalQty?: number | null;
    buyerPoPrice?: number | string | null;
    exchangePrice?: number | string | null;
    priceInInr?: number | string | null;
  }>;
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

const reportFieldDefinitions: Array<{ key: FilterableOrderField; label: string }> = [
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

const defaultSizeRow = (): FinishedGoodsRow => ({
  buyerSize: "",
  size: "",
  beforeExcessQty: "",
  excess: "",
  excessQty: "",
  totalQty: "",
  buyerPoPrice: "",
  exchangePrice: "",
  priceInInr: "",
});

const emptyForm = {
  id: "",
  orderNo: "",
  entityName: "",
  category: "",
  subCategory: "",
  season: "",
  article: "",
  styleName: "",
  colors: "",
  buyer: "",
  brand: "",
  sizeGroup: "",
  orderQty: "",
  deliveryDate: "",
  finalStatus: "Draft",
  processStatus: "Draft",
  rows: [defaultSizeRow()],
};

export default function MerchandisingOrdersPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<(typeof dsStatusOptions)[number]>("Draft");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "finishedGoods">("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>("");
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [visibleReportFields, setVisibleReportFields] = useState<FilterableOrderField[]>(
    reportFieldDefinitions.map((field) => field.key),
  );

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const response = await fetch(`/api/orders?organizationId=${encodeURIComponent(organizationId)}`);
        const data = await response.json();
        const fetched = data.orders ?? [];
        setOrders(fetched);

        if (fetched.length > 0) {
          setSelectedOrderId(fetched[0].id);
          setSelectedOrderIds([]);
          setForm(mapOrderToForm(fetched[0]));
          setShowForm(false);
        } else {
          setSelectedOrderId("");
          setSelectedOrderIds([]);
          setForm({ ...emptyForm, rows: [defaultSizeRow()] });
          setShowForm(false);
        }
      } catch (error) {
        console.error("Unable to load orders", error);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [organizationId]);

  const filteredOrders = useMemo(
    () =>
      !selectedStatus || selectedStatus === "Draft"
        ? orders.filter((order) => order.finalStatus === "Draft")
        : orders.filter((order) => order.finalStatus === selectedStatus),
    [orders, selectedStatus],
  );

  const addSizeRow = () => {
    setForm((current) => ({ ...current, rows: [...current.rows, defaultSizeRow()] }));
  };

  const removeSizeRow = (index: number) => {
    setForm((current) => {
      const nextRows = current.rows.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, rows: nextRows.length ? nextRows : [defaultSizeRow()] };
    });
  };

  const updateSizeRow = (index: number, field: keyof FinishedGoodsRow, value: string) => {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    }));
  };

  function mapOrderToForm(order: OrderRecord) {
    return {
      id: order.id,
      orderNo: order.orderNo ?? "",
      entityName: order.entityName ?? "",
      category: order.category ?? "",
      subCategory: order.subCategory ?? "",
      season: order.season ?? "",
      article: order.article ?? "",
      styleName: order.styleName ?? "",
      colors: order.colors ?? "",
      buyer: order.buyer ?? "",
      brand: order.brand ?? "",
      sizeGroup: order.sizeGroup ?? "",
      orderQty: order.orderQty?.toString() ?? "",
      deliveryDate: order.deliveryDate ? order.deliveryDate.slice(0, 10) : "",
      finalStatus: order.finalStatus ?? "Draft",
      processStatus: order.processStatus ?? "Draft",
      rows:
        (order.finishedGoods ?? []).length > 0
          ? order.finishedGoods!.map((item) => ({
              id: item.id,
              buyerSize: item.buyerSize ?? "",
              size: item.size ?? "",
              beforeExcessQty: item.beforeExcessQty?.toString() ?? "",
              excess: item.excess?.toString() ?? "",
              excessQty: item.excessQty?.toString() ?? "",
              totalQty: item.totalQty?.toString() ?? "",
              buyerPoPrice: item.buyerPoPrice?.toString() ?? "",
              exchangePrice: item.exchangePrice?.toString() ?? "",
              priceInInr: item.priceInInr?.toString() ?? "",
            }))
          : [defaultSizeRow()],
    };
  }

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowForm(true);
    setActiveTab("details");
    const order = orders.find((item) => item.id === orderId);
    if (order) setForm(mapOrderToForm(order));
  };

  const handleToggleOrderSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        if (current.includes(orderId)) return current;
        return [...current, orderId];
      }

      return current.filter((id) => id !== orderId);
    });

    if (checked) {
      setSelectedOrderId(orderId);
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        const merged = new Set([...current, ...filteredOrders.map((order) => order.id)]);
        return [...merged];
      }

      const filteredOrderIds = new Set(filteredOrders.map((order) => order.id));
      return current.filter((id) => !filteredOrderIds.has(id));
    });

    if (checked && filteredOrders.length > 0) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  };

  const handleNewOrder = () => {
    setSelectedOrderId("");
    setShowForm(true);
    setActiveTab("details");
    setSaveError("");
    setForm({ ...emptyForm, rows: [defaultSizeRow()] });
  };

  const closeForm = () => {
    setShowForm(false);
    setActiveTab("details");
    setSaveError("");
  };

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError("");

    const nextOrderNo = form.orderNo.trim() || `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const normalizedForm = { ...form, orderNo: nextOrderNo };

    if (!nextOrderNo) {
      setSaveError("Order No is required.");
      return;
    }

    setSaving(true);

    const payload = {
      id: normalizedForm.id || undefined,
      orderNo: normalizedForm.orderNo,
      entityName: normalizedForm.entityName,
      category: normalizedForm.category,
      subCategory: normalizedForm.subCategory,
      season: normalizedForm.season,
      article: normalizedForm.article,
      styleName: normalizedForm.styleName,
      colors: normalizedForm.colors,
      buyer: normalizedForm.buyer,
      brand: normalizedForm.brand,
      sizeGroup: normalizedForm.sizeGroup,
      orderQty: normalizedForm.orderQty ? Number(normalizedForm.orderQty) : null,
      deliveryDate: normalizedForm.deliveryDate || null,
      finalStatus: normalizedForm.finalStatus,
      processStatus: normalizedForm.processStatus,
      rows: normalizedForm.rows.map((row) => ({
        buyerSize: row.buyerSize,
        size: row.size,
        beforeExcessQty: row.beforeExcessQty,
        excess: row.excess,
        excessQty: row.excessQty,
        totalQty: row.totalQty,
        buyerPoPrice: row.buyerPoPrice,
        exchangePrice: row.exchangePrice,
        priceInInr: row.priceInInr,
      })),
    };

    try {
      const response = await fetch("/api/orders", {
        method: normalizedForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, organizationId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Unable to save order");
      }

      const data = await response.json();
      const savedOrder = data.order;
      const updatedOrders = normalizedForm.id
        ? orders.map((order) => (order.id === normalizedForm.id ? savedOrder : order))
        : [savedOrder, ...orders];

      setOrders(updatedOrders);
      setSelectedOrderId(savedOrder.id);
      setShowForm(true);
      setForm(mapOrderToForm(savedOrder));
    } catch (error) {
      console.error("Save failed", error);
      setSaveError(error instanceof Error ? error.message : "Unable to save this order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName="Credence Craft"
      value="order-management"
      moduleLabel="Order Management"
      title="Orders"
      description="Zoho DS-based order list and edit workflow for Create Order and Finished Goods Size Wise."
      subItems={[
        { key: "home", label: "Home", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management` },
        { key: "merchandising", label: "Merchandising", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising` },
        { key: "purchase", label: "Purchase", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/purchase` },
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-700">Orders</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Merchandising Order List</h2>
          </div>
          <button
            type="button"
            onClick={handleNewOrder}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            + New Order
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
          <div className="flex flex-wrap gap-2">
            {dsStatusOptions.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatus(status)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  selectedStatus === status
                    ? "border-emerald-300 bg-emerald-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[70vh] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Loading orders...
          </div>
        ) : (
          <ReportGrid
            title="Report View"
            storageKey="merchandising-order-report-settings"
            records={filteredOrders}
            fields={reportFieldDefinitions}
            visibleFields={visibleReportFields}
            onVisibleFieldsChange={(value) => setVisibleReportFields(value as FilterableOrderField[])}
            rowIdSelector={(order) => order.id}
            selectedRowId={selectedOrderId}
            selectedIds={selectedOrderIds}
            onRowClick={handleSelectOrder}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleRowSelection={handleToggleOrderSelection}
            emptyMessage="No matching records for the applied filters."
            statusOptions={dsStatusOptions}
            selectedStatus={selectedStatus}
            onStatusChange={(status) => setSelectedStatus(status as (typeof dsStatusOptions)[number])}
            renderCell={(fieldKey, order) => {
              switch (fieldKey) {
                case "orderQty":
                  return order.orderQty ?? "-";
                case "deliveryDate":
                  return order.deliveryDate
                    ? new Date(order.deliveryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    : "-";
                case "finalStatus":
                  return (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${order.finalStatus === "Approved" ? "bg-emerald-100 text-emerald-700" : order.finalStatus === "Draft" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-700"}`}>
                      {order.finalStatus}
                    </span>
                  );
                default:
                  return ((order as unknown) as Record<string, string | number | null | undefined>)[fieldKey] ?? "-";
              }
            }}
          />
        )}

        {showForm ? (
          <div className="fixed inset-0 z-[100] h-screen w-screen bg-slate-950/45 p-0">
            <div className="flex h-full w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-700">{form.id ? "Edit Order" : "Create Order"}</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{form.orderNo || "New Order"}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {form.finalStatus}
                  </span>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
                {[
                  { key: "details", label: "Order Details Form" },
                  { key: "finishedGoods", label: "Finished Goods Form" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as "details" | "finishedGoods")}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      activeTab === tab.key
                        ? "border-emerald-300 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto p-4 sm:p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {activeTab === "details" ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Order No</span>
                        <input value={form.orderNo} onChange={(event) => handleChange("orderNo", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Order_No" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Entity Name</span>
                        <input value={form.entityName} onChange={(event) => handleChange("entityName", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Entity_Name" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Category</span>
                        <input value={form.category} onChange={(event) => handleChange("category", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Product_Master" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Sub Category</span>
                        <input value={form.subCategory} onChange={(event) => handleChange("subCategory", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Products" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Season</span>
                        <input value={form.season} onChange={(event) => handleChange("season", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Season" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Article</span>
                        <input value={form.article} onChange={(event) => handleChange("article", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Gold_Seal" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Style Name</span>
                        <input value={form.styleName} onChange={(event) => handleChange("styleName", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Style_Name" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Colors</span>
                        <input value={form.colors} onChange={(event) => handleChange("colors", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Colors" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Buyer</span>
                        <input value={form.buyer} onChange={(event) => handleChange("buyer", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Buyer1" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Brand</span>
                        <input value={form.brand} onChange={(event) => handleChange("brand", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Brand1" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Size Group</span>
                        <input value={form.sizeGroup} onChange={(event) => handleChange("sizeGroup", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Size_Group" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Order Qty</span>
                        <input type="number" value={form.orderQty} onChange={(event) => handleChange("orderQty", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Order_Qty" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Delivery Date</span>
                        <input type="date" value={form.deliveryDate} onChange={(event) => handleChange("deliveryDate", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white" />
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Final Status</span>
                        <select value={form.finalStatus} onChange={(event) => handleChange("finalStatus", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white">
                          {dsStatusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-sm text-slate-600">
                        <span className="mb-1.5 block font-medium text-slate-700">Process Status</span>
                        <select value={form.processStatus} onChange={(event) => handleChange("processStatus", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white">
                          <option value="Draft">Draft</option>
                          <option value="Approved">Approved</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900">Finished Goods Size Wise</h3>
                        <button type="button" onClick={addSizeRow} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                          + Add Row
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-100 text-slate-600">
                            <tr>
                              <th className="px-3 py-2.5 font-medium">Buyer Size</th>
                              <th className="px-3 py-2.5 font-medium">Size</th>
                              <th className="px-3 py-2.5 font-medium">Before Excess Qty</th>
                              <th className="px-3 py-2.5 font-medium">Excess %</th>
                              <th className="px-3 py-2.5 font-medium">Excess Qty</th>
                              <th className="px-3 py-2.5 font-medium">Total Qty</th>
                              <th className="px-3 py-2.5 font-medium">Buyer Po Price</th>
                              <th className="px-3 py-2.5 font-medium">Exchange Price</th>
                              <th className="px-3 py-2.5 font-medium">Price In INR</th>
                              <th className="px-3 py-2.5 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.rows.map((row, index) => (
                              <tr key={`${index}-${row.size || "row"}`} className="border-t border-slate-200">
                                <td className="px-2 py-2">
                                  <input value={row.buyerSize} onChange={(event) => updateSizeRow(index, "buyerSize", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="Buyer Size" />
                                </td>
                                <td className="px-2 py-2">
                                  <input value={row.size} onChange={(event) => updateSizeRow(index, "size", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="Size" />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={row.beforeExcessQty} onChange={(event) => updateSizeRow(index, "beforeExcessQty", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="0" />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={row.excess} onChange={(event) => updateSizeRow(index, "excess", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="0" />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={row.excessQty} onChange={(event) => updateSizeRow(index, "excessQty", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="0" />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={row.totalQty} onChange={(event) => updateSizeRow(index, "totalQty", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="0" />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={row.buyerPoPrice} onChange={(event) => updateSizeRow(index, "buyerPoPrice", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="0.00" />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={row.exchangePrice} onChange={(event) => updateSizeRow(index, "exchangePrice", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="0.00" />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={row.priceInInr} onChange={(event) => updateSizeRow(index, "priceInInr", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700 outline-none transition focus:border-emerald-300" placeholder="0.00" />
                                </td>
                                <td className="px-2 py-2">
                                  <button type="button" onClick={() => removeSizeRow(index)} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {saveError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveError}</div>
                  ) : null}

                  <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={closeForm}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Back to Report
                    </button>
                    <button type="button" onClick={() => setForm({ ...emptyForm, rows: [defaultSizeRow()] })} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      Reset
                    </button>
                    <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70">
                      {saving ? "Saving..." : form.id ? "Update Order" : "Save Order"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </MasterModuleShell>
  );
}
