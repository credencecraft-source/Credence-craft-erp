"use client";

import { startTransition, type FormEvent, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

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
  haveSizeRatio?: boolean | null;
  ratioOrderQty?: number | null;
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

type MasterOption = {
  id: string;
  label: string;
  code: string | null;
  is_active: boolean;
  parentValueId?: string | null;
};

type OrderLookupDefinition = { key: string; lookupModuleKey?: string; dependsOn?: string };

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
  haveSizeRatio: false,
  ratioOrderQty: "",
  orderQty: "",
  deliveryDate: "",
  finalStatus: "Draft",
  processStatus: "Draft",
  rows: [defaultSizeRow()],
};

const mapOrderToForm = (order: OrderRecord) => ({
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
  haveSizeRatio: order.haveSizeRatio ?? false,
  ratioOrderQty: order.ratioOrderQty?.toString() ?? "",
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
});

async function fetchMasterOptions(organizationId: string) {
  const response = await fetch(`/api/masters?organizationId=${encodeURIComponent(organizationId)}&includeInactive=true`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load master values.");
  }

  const data = await response.json();
  const options: Record<string, MasterOption[]> = {};

  for (const master of data.masters ?? []) {
    options[master.module_key] = Array.isArray(master.values)
      ? master.values.map((item: { id: string; label: string; code?: string | null; is_active?: boolean; parent_id?: string | null; metadata?: { parentValueId?: string | null } }) => ({
          id: item.id,
          label: item.label,
          code: item.code ?? null,
          is_active: item.is_active !== false,
          parentValueId: item.parent_id ?? item.metadata?.parentValueId ?? null,
        }))
      : [];
  }

  return { options, orderLookups: (data.orderLookups ?? []) as OrderLookupDefinition[] };
}

export default function MerchandisingOrderDetailsPage() {
  const rawParams = useParams();
  const router = useRouter();

  // Safe fallback to extract ID and parameters robustly if Next.js useParams is empty or delayed
  const pathSegments = typeof window !== "undefined" ? window.location.pathname.split("/") : [];
  const fallbackOrgId = pathSegments[pathSegments.indexOf("organizations") + 1];
  const fallbackWorkspaceId = pathSegments[pathSegments.indexOf("dashboard") + 1];
  const fallbackId = pathSegments[pathSegments.length - 1];

  const workspaceId = (rawParams?.workspaceId as string) ?? fallbackWorkspaceId ?? "demo";
  const organizationId = (rawParams?.organizationId as string) ?? fallbackOrgId ?? "demo-org";
  const rawId = (rawParams?.id as string) ?? fallbackId;
  const orderId = rawId !== "orders" && rawId !== "create" ? rawId : "";

  const [activeTab, setActiveTab] = useState<"details" | "finishedGoods">("details");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm, rows: [defaultSizeRow()] });

  const [masterOptions, setMasterOptions] = useState<Record<string, MasterOption[]>>({});
  const [orderLookups, setOrderLookups] = useState<OrderLookupDefinition[]>([]);
  const [createMasterKey, setCreateMasterKey] = useState<string | null>(null);
  const [createMasterLabel, setCreateMasterLabel] = useState("");
  const [createMasterCode, setCreateMasterCode] = useState("");
  const [createMasterDescription, setCreateMasterDescription] = useState("");
  const [creatingMaster, setCreatingMaster] = useState(false);
  const [masterCreateError, setMasterCreateError] = useState("");

  const goBack = () => {
    startTransition(() => {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`);
    });
  };

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const masters = await fetchMasterOptions(organizationId);
      setMasterOptions(masters.options);
      setOrderLookups(masters.orderLookups);

      if (orderId) {
        const response = await fetch(`/api/orders/${orderId}?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (data?.order) {
            setForm(mapOrderToForm(data.order));
          }
        }
      }
    } catch (error) {
      console.error("Unable to load form data", error);
    }
  }, [organizationId, orderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveError("");
  };

  const masterSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string,
  ) => {
    const lookupDefinition = orderLookups.find((definition) => definition.lookupModuleKey === masterKey);
    const parentValue = lookupDefinition?.dependsOn ? form[lookupDefinition.dependsOn as keyof typeof form] : "";
    const parentOption = lookupDefinition?.dependsOn ? (masterOptions[lookupDefinition.dependsOn === "category" ? "category" : "brand"] ?? []).find((option) => option.label === parentValue) : null;
    const options = (masterOptions[masterKey] ?? []).filter((option) => !lookupDefinition?.dependsOn || option.parentValueId === parentOption?.id);

    return (
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>{label}</span>
          <button
            type="button"
            onClick={() => {
              setCreateMasterKey(masterKey);
              setMasterCreateError("");
            }}
            className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
          >
            + Create new
          </button>
        </span>
        <select
          value={value}
          onChange={(event) => {
            const selected = options.find((option) => option.label === event.target.value);
            if (selected && !selected.is_active) {
              window.alert(`${selected.label} is not approved yet.`);
              onChange("");
              return;
            }
            onChange(event.target.value);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.label}>
              {option.is_active ? option.label : `${option.label} (Not approved)`}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const closeMasterCreate = () => {
    setCreateMasterKey(null);
    setCreateMasterLabel("");
    setCreateMasterCode("");
    setCreateMasterDescription("");
    setMasterCreateError("");
  };

  const handleMasterCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createMasterKey || !createMasterLabel.trim()) return;

    setCreatingMaster(true);
    setMasterCreateError("");
    try {
      const response = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          moduleKey: createMasterKey,
          label: createMasterLabel,
          code: createMasterCode,
          description: createMasterDescription,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to create master value.");
      const masters = await fetchMasterOptions(organizationId);
      setMasterOptions(masters.options);
      setOrderLookups(masters.orderLookups);
      closeMasterCreate();
    } catch (error) {
      setMasterCreateError(error instanceof Error ? error.message : "Unable to create master value.");
    } finally {
      setCreatingMaster(false);
    }
  };

  const updateSizeRow = (index: number, field: keyof FinishedGoodsRow, value: string) => {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    }));
  };

  const addSizeRow = () => {
    setForm((current) => ({ ...current, rows: [...current.rows, defaultSizeRow()] }));
  };

  const removeSizeRow = (index: number) => {
    setForm((current) => {
      const nextRows = current.rows.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, rows: nextRows.length ? nextRows : [defaultSizeRow()] };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError("");

    const nextOrderNo =
      form.orderNo.trim() ||
      `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const normalizedForm = { ...form, orderNo: nextOrderNo };
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
      haveSizeRatio: normalizedForm.haveSizeRatio,
      ratioOrderQty: normalizedForm.ratioOrderQty ? Number(normalizedForm.ratioOrderQty) : null,
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
        method: orderId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, organizationId, ...(orderId ? { id: orderId } : {}) }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Unable to save order.");
      }

      goBack();
    } catch (error) {
      console.error("Save failed", error);
      setSaveError(error instanceof Error ? error.message : "Unable to save this order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{orderId ? "Edit Order" : "Create Order"}</p>
          <h2 className="text-xl font-bold text-slate-900">{form.orderNo || "New Order"}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {form.finalStatus}
          </span>
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to Report
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex gap-2 border-b border-slate-200 pb-4">
          {[
            { key: "details", label: "Order Details Form" },
            { key: "finishedGoods", label: "Finished Goods Form" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as "details" | "finishedGoods")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                activeTab === tab.key
                  ? "border-emerald-300 bg-emerald-700 text-white shadow-sm"
                  : "border-emerald-100 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "details" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Order No</span>
              <input
                value={form.orderNo}
                onChange={(event) => handleChange("orderNo", event.target.value)}
                placeholder="Order_No"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            {masterSelect("Entity Name", form.entityName, (value) => handleChange("entityName", value), "entity", "Select entity")}
            {masterSelect("Category", form.category, (value) => handleChange("category", value), "category", "Select category")}
            {masterSelect("Sub Category", form.subCategory, (value) => handleChange("subCategory", value), "sub-category", "Select sub category")}
            {masterSelect("Season", form.season, (value) => handleChange("season", value), "season", "Select season")}
            {masterSelect("Article", form.article, (value) => handleChange("article", value), "article", "Select article")}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Style Name</span>
              <input
                value={form.styleName}
                onChange={(event) => handleChange("styleName", event.target.value)}
                placeholder="Style_Name"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            {masterSelect("Colors", form.colors, (value) => handleChange("colors", value), "color", "Select color")}
            {masterSelect("Buyer", form.buyer, (value) => handleChange("buyer", value), "buyer", "Select buyer")}
            {masterSelect("Brand", form.brand, (value) => handleChange("brand", value), "brand", "Select brand")}
            {masterSelect("Size Group", form.sizeGroup, (value) => handleChange("sizeGroup", value), "size-group", "Select size group")}
            
            <label className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={form.haveSizeRatio}
                onChange={(event) => setForm((current) => ({ ...current, haveSizeRatio: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-700">Have Size Ratio</span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Ratio Order Qty</span>
              <input
                type="number"
                value={form.ratioOrderQty}
                onChange={(event) => handleChange("ratioOrderQty", event.target.value)}
                placeholder="Ratio_Order_Qty"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Order Qty</span>
              <input
                type="number"
                value={form.orderQty}
                onChange={(event) => handleChange("orderQty", event.target.value)}
                placeholder="Order_Qty"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Delivery Date</span>
              <input
                type="date"
                value={form.deliveryDate}
                onChange={(event) => handleChange("deliveryDate", event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Final Status</span>
              <select
                value={form.finalStatus}
                onChange={(event) => handleChange("finalStatus", event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
              >
                {dsStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Process Status</span>
              <select
                value={form.processStatus}
                onChange={(event) => handleChange("processStatus", event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Finished Goods Size Wise</h3>
              <button
                type="button"
                onClick={addSizeRow}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
              >
                + Add Row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="p-2">Buyer Size</th>
                    <th className="p-2">Size</th>
                    <th className="p-2">Before Excess Qty</th>
                    <th className="p-2">Excess %</th>
                    <th className="p-2">Excess Qty</th>
                    <th className="p-2">Total Qty</th>
                    <th className="p-2">Buyer Po Price</th>
                    <th className="p-2">Exchange Price</th>
                    <th className="p-2">Price In INR</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.rows.map((row, index) => (
                    <tr key={`${index}-${row.size || "row"}`}>
                      <td className="p-2"><input value={row.buyerSize} onChange={(event) => updateSizeRow(index, "buyerSize", event.target.value)} placeholder="Buyer Size" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2">
                        <select
                          value={row.size}
                          onChange={(event) => updateSizeRow(index, "size", event.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 bg-white"
                        >
                          <option value="">Select size</option>
                          {(masterOptions.size ?? []).map((option) => (
                            <option key={option.id} value={option.label}>{option.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2"><input type="number" value={row.beforeExcessQty} onChange={(event) => updateSizeRow(index, "beforeExcessQty", event.target.value)} placeholder="0" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><input type="number" value={row.excess} onChange={(event) => updateSizeRow(index, "excess", event.target.value)} placeholder="0" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><input type="number" value={row.excessQty} onChange={(event) => updateSizeRow(index, "excessQty", event.target.value)} placeholder="0" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><input type="number" value={row.totalQty} onChange={(event) => updateSizeRow(index, "totalQty", event.target.value)} placeholder="0" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><input type="number" value={row.buyerPoPrice} onChange={(event) => updateSizeRow(index, "buyerPoPrice", event.target.value)} placeholder="0.00" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><input type="number" value={row.exchangePrice} onChange={(event) => updateSizeRow(index, "exchangePrice", event.target.value)} placeholder="0.00" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><input type="number" value={row.priceInInr} onChange={(event) => updateSizeRow(index, "priceInInr", event.target.value)} placeholder="0.00" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><button type="button" onClick={() => removeSizeRow(index)} className="text-red-600 hover:text-red-700 font-medium">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {saveError ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{saveError}</div> : null}

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to Report
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...emptyForm, rows: [defaultSizeRow()] })}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : orderId ? "Update Order" : "Save Order"}
          </button>
        </div>
      </form>

      {createMasterKey ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Create master</p>
                <h3 className="text-base font-bold text-slate-900">Add {createMasterKey.replace(/-/g, " ")}</h3>
              </div>
              <button type="button" onClick={closeMasterCreate} className="text-slate-400 hover:text-slate-600">
                Close
              </button>
            </div>

            <form onSubmit={handleMasterCreate} className="mt-4 space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Name</span>
                <input
                  value={createMasterLabel}
                  onChange={(event) => setCreateMasterLabel(event.target.value)}
                  required
                  autoFocus
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Code</span>
                <input
                  value={createMasterCode}
                  onChange={(event) => setCreateMasterCode(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Description</span>
                <textarea
                  value={createMasterDescription}
                  onChange={(event) => setCreateMasterDescription(event.target.value)}
                  rows={3}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                />
              </label>
              {masterCreateError ? <p className="text-xs text-red-600">{masterCreateError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeMasterCreate}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMaster}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creatingMaster ? "Creating..." : "Create master"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}