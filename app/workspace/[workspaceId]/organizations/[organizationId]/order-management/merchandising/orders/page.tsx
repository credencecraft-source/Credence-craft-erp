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
      <div >
        <div >
          <div>
            <p >Orders</p>
            <h2 >Merchandising Order List</h2>
          </div>
          <button
            type="button"
            onClick={handleNewOrder}
            
          >
            + New Order
          </button>
        </div>

        <div >
          <div >
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
          <div >
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
          <div >
            <div >
              <div >
                <div>
                  <p >{form.id ? "Edit Order" : "Create Order"}</p>
                  <h3 >{form.orderNo || "New Order"}</h3>
                </div>
                <div >
                  <span >
                    {form.finalStatus}
                  </span>
                  <button
                    type="button"
                    onClick={closeForm}
                    
                  >
                    Close
                  </button>
                </div>
              </div>

              <div >
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

              <div >
                <form onSubmit={handleSubmit} >
                  {activeTab === "details" ? (
                    <div >
                      <label >
                        <span >Order No</span>
                        <input value={form.orderNo} onChange={(event) => handleChange("orderNo", event.target.value)}  placeholder="Order_No" />
                      </label>

                      <label >
                        <span >Entity Name</span>
                        <input value={form.entityName} onChange={(event) => handleChange("entityName", event.target.value)}  placeholder="Entity_Name" />
                      </label>

                      <label >
                        <span >Category</span>
                        <input value={form.category} onChange={(event) => handleChange("category", event.target.value)}  placeholder="Product_Master" />
                      </label>

                      <label >
                        <span >Sub Category</span>
                        <input value={form.subCategory} onChange={(event) => handleChange("subCategory", event.target.value)}  placeholder="Products" />
                      </label>

                      <label >
                        <span >Season</span>
                        <input value={form.season} onChange={(event) => handleChange("season", event.target.value)}  placeholder="Season" />
                      </label>

                      <label >
                        <span >Article</span>
                        <input value={form.article} onChange={(event) => handleChange("article", event.target.value)}  placeholder="Gold_Seal" />
                      </label>

                      <label >
                        <span >Style Name</span>
                        <input value={form.styleName} onChange={(event) => handleChange("styleName", event.target.value)}  placeholder="Style_Name" />
                      </label>

                      <label >
                        <span >Colors</span>
                        <input value={form.colors} onChange={(event) => handleChange("colors", event.target.value)}  placeholder="Colors" />
                      </label>

                      <label >
                        <span >Buyer</span>
                        <input value={form.buyer} onChange={(event) => handleChange("buyer", event.target.value)}  placeholder="Buyer1" />
                      </label>

                      <label >
                        <span >Brand</span>
                        <input value={form.brand} onChange={(event) => handleChange("brand", event.target.value)}  placeholder="Brand1" />
                      </label>

                      <label >
                        <span >Size Group</span>
                        <input value={form.sizeGroup} onChange={(event) => handleChange("sizeGroup", event.target.value)}  placeholder="Size_Group" />
                      </label>

                      <label >
                        <span >Order Qty</span>
                        <input type="number" value={form.orderQty} onChange={(event) => handleChange("orderQty", event.target.value)}  placeholder="Order_Qty" />
                      </label>

                      <label >
                        <span >Delivery Date</span>
                        <input type="date" value={form.deliveryDate} onChange={(event) => handleChange("deliveryDate", event.target.value)}  />
                      </label>

                      <label >
                        <span >Final Status</span>
                        <select value={form.finalStatus} onChange={(event) => handleChange("finalStatus", event.target.value)} >
                          {dsStatusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>

                      <label >
                        <span >Process Status</span>
                        <select value={form.processStatus} onChange={(event) => handleChange("processStatus", event.target.value)} >
                          <option value="Draft">Draft</option>
                          <option value="Approved">Approved</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div >
                      <div >
                        <h3 >Finished Goods Size Wise</h3>
                        <button type="button" onClick={addSizeRow} >
                          + Add Row
                        </button>
                      </div>

                      <div >
                        <table >
                          <thead >
                            <tr>
                              <th >Buyer Size</th>
                              <th >Size</th>
                              <th >Before Excess Qty</th>
                              <th >Excess %</th>
                              <th >Excess Qty</th>
                              <th >Total Qty</th>
                              <th >Buyer Po Price</th>
                              <th >Exchange Price</th>
                              <th >Price In INR</th>
                              <th >Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.rows.map((row, index) => (
                              <tr key={`${index}-${row.size || "row"}`} >
                                <td >
                                  <input value={row.buyerSize} onChange={(event) => updateSizeRow(index, "buyerSize", event.target.value)}  placeholder="Buyer Size" />
                                </td>
                                <td >
                                  <input value={row.size} onChange={(event) => updateSizeRow(index, "size", event.target.value)}  placeholder="Size" />
                                </td>
                                <td >
                                  <input type="number" value={row.beforeExcessQty} onChange={(event) => updateSizeRow(index, "beforeExcessQty", event.target.value)}  placeholder="0" />
                                </td>
                                <td >
                                  <input type="number" value={row.excess} onChange={(event) => updateSizeRow(index, "excess", event.target.value)}  placeholder="0" />
                                </td>
                                <td >
                                  <input type="number" value={row.excessQty} onChange={(event) => updateSizeRow(index, "excessQty", event.target.value)}  placeholder="0" />
                                </td>
                                <td >
                                  <input type="number" value={row.totalQty} onChange={(event) => updateSizeRow(index, "totalQty", event.target.value)}  placeholder="0" />
                                </td>
                                <td >
                                  <input type="number" value={row.buyerPoPrice} onChange={(event) => updateSizeRow(index, "buyerPoPrice", event.target.value)}  placeholder="0.00" />
                                </td>
                                <td >
                                  <input type="number" value={row.exchangePrice} onChange={(event) => updateSizeRow(index, "exchangePrice", event.target.value)}  placeholder="0.00" />
                                </td>
                                <td >
                                  <input type="number" value={row.priceInInr} onChange={(event) => updateSizeRow(index, "priceInInr", event.target.value)}  placeholder="0.00" />
                                </td>
                                <td >
                                  <button type="button" onClick={() => removeSizeRow(index)} >
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
                    <div >{saveError}</div>
                  ) : null}

                  <div >
                    <button
                      type="button"
                      onClick={closeForm}
                      
                    >
                      Back to Report
                    </button>
                    <button type="button" onClick={() => setForm({ ...emptyForm, rows: [defaultSizeRow()] })} >
                      Reset
                    </button>
                    <button type="submit" disabled={saving} >
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
