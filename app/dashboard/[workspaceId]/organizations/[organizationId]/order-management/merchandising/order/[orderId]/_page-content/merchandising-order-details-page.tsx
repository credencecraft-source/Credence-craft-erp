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
  bomItems?: Array<{
    id?: string;
    categoryType?: string | null;
    category?: string | null;
    subCategory?: string | null;
    rawMaterialName?: string | null;
    size?: string | null;
    consumption?: number | string | null;
    requiredQty?: number | string | null;
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

type BomRow = {
  id?: string;
  categoryType: string;
  category: string;
  subCategory: string;
  rawMaterialName: string;
  size: string;
  consumption: string;
  requiredQty: string;
};

const defaultBomRow = (): BomRow => ({
  categoryType: "",
  category: "",
  subCategory: "",
  rawMaterialName: "",
  size: "",
  consumption: "",
  requiredQty: "",
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
  bomRows: [defaultBomRow()],
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
  bomRows:
    (order.bomItems ?? []).length > 0
      ? order.bomItems!.map((item) => ({
          id: item.id,
          categoryType: item.categoryType ?? "",
          category: item.category ?? "",
          subCategory: item.subCategory ?? "",
          rawMaterialName: item.rawMaterialName ?? "",
          size: item.size ?? "",
          consumption: item.consumption?.toString() ?? "",
          requiredQty: item.requiredQty?.toString() ?? "",
        }))
      : [defaultBomRow()],
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

  const workspaceId = (rawParams?.workspaceId as string) ?? "demo";
  const organizationId = (rawParams?.organizationId as string) ?? "demo-org";
  
  const rawId = (rawParams?.orderId as string) ?? (rawParams?.id as string) ?? "";
  const orderId = rawId && rawId !== "orders" && rawId !== "create" ? rawId : "";

  const [activeTab, setActiveTab] = useState<"details" | "finishedGoods" | "bom">("details");
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
        let response = await fetch(`/api/orders/${orderId}?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
        if (!response.ok) {
          response = await fetch(`/api/orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
          if (response.ok) {
            const listData = await response.json();
            const matched = (listData?.orders ?? []).find((o: OrderRecord) => o.id === orderId);
            if (matched) {
              setForm(mapOrderToForm(matched));
              return;
            }
          }
        } else {
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

  const handleChange = (field: keyof typeof emptyForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveError("");
  };

  const addSizeRow = () => {
    setForm((current) => ({ ...current, rows: [...current.rows, defaultSizeRow()] }));
  };

  const removeSizeRow = (index: number) => {
    setForm((current) => ({
      ...current,
      rows: current.rows.filter((_, i) => i !== index),
    }));
  };

  const updateSizeRow = (index: number, field: keyof FinishedGoodsRow, value: string) => {
    setForm((current) => {
      const updatedRows = [...current.rows];
      updatedRows[index] = { ...updatedRows[index], [field]: value };
      return { ...current, rows: updatedRows };
    });
  };

  const addBomRow = () => {
    setForm((current) => ({ ...current, bomRows: [...current.bomRows, defaultBomRow()] }));
  };

  const removeBomRow = (index: number) => {
    setForm((current) => ({
      ...current,
      bomRows: current.bomRows.filter((_, i) => i !== index),
    }));
  };

  const updateBomRow = (index: number, field: keyof BomRow, value: string) => {
    setForm((current) => {
      const updatedRows = [...current.bomRows];
      updatedRows[index] = { ...updatedRows[index], [field]: value };
      return { ...current, bomRows: updatedRows };
    });
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
    
    let options = (masterOptions[masterKey] ?? []).filter((option) => !lookupDefinition?.dependsOn || option.parentValueId === parentOption?.id);

    if (value && !options.some((opt) => opt.label === value)) {
      options = [{ id: "current-legacy", label: value, code: null, is_active: true }, ...options];
    }

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
            + New
          </button>
        </span>
        <select
          value={value}
          onChange={(event) => {
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

  const renderMasterSelect = (
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string,
    parentCategoryValue?: string
  ) => {
    let options = masterOptions[masterKey] ?? [];
    if (masterKey === "raw-material-sub-category" && parentCategoryValue) {
      const parentOption = (masterOptions["raw-material-category"] ?? []).find((opt) => opt.label === parentCategoryValue);
      options = options.filter((opt) => opt.parentValueId === parentOption?.id);
    }

    if (value && !options.some((opt) => opt.label === value)) {
      options = [{ id: "current-legacy-row", label: value, code: null, is_active: true }, ...options];
    }

    return (
      <div className="flex flex-col gap-1">
        <select
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="w-full rounded border border-slate-200 px-2 py-1 bg-white text-xs"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.label}>
              {option.is_active ? option.label : `${option.label} (Not approved)`}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const closeMasterCreate = () => {
    setCreateMasterKey(null);
    setCreateMasterLabel("");
    setCreateMasterCode("");
    setCreateMasterDescription("");
    setMasterCreateError("");
  };

  const handleCreateMasterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!createMasterKey || !createMasterLabel.trim()) return;
    setCreatingMaster(true);
    setMasterCreateError("");

    try {
      const response = await fetch(`/api/masters/values?organizationId=${encodeURIComponent(organizationId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleKey: createMasterKey,
          label: createMasterLabel.trim(),
          code: createMasterCode.trim() || null,
          description: createMasterDescription.trim() || null,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create master option.");
      }

      await loadData();
      closeMasterCreate();
    } catch (err: any) {
      setMasterCreateError(err.message || "Something went wrong.");
    } finally {
      setCreatingMaster(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      const endpoint = orderId 
        ? `/api/orders/${orderId}?organizationId=${encodeURIComponent(organizationId)}`
        : `/api/orders?organizationId=${encodeURIComponent(organizationId)}`;
      
      const method = orderId ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to save order.");
      }

      goBack();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Back
          </button>
          <h2 className="text-lg font-bold text-slate-900">
            {orderId ? "Edit Order" : "Create New Order"}
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${activeTab === "details" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            General Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("finishedGoods")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${activeTab === "finishedGoods" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            Finished Goods ({form.rows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bom")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${activeTab === "bom" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            Bill of Materials ({form.bomRows.length})
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {activeTab === "details" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Order No</span>
              <input
                type="text"
                value={form.orderNo}
                onChange={(event) => handleChange("orderNo", event.target.value)}
                placeholder="Order Number"
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
                type="text"
                value={form.styleName}
                onChange={(event) => handleChange("styleName", event.target.value)}
                placeholder="Style Name"
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
                onChange={(event) => handleChange("haveSizeRatio", event.target.checked)}
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
        ) : activeTab === "finishedGoods" ? (
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
                        {renderMasterSelect(row.size, (val) => updateSizeRow(index, "size", val), "size", "Select size")}
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
        ) : (
          <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Bill of Materials</h3>
              <button
                type="button"
                onClick={addBomRow}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
              >
                + Add Row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>Raw Material Type</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateMasterKey("raw-material-type");
                            setMasterCreateError("");
                          }}
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          + New
                        </button>
                      </div>
                    </th>
                    <th className="p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>Raw Material Category</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateMasterKey("raw-material-category");
                            setMasterCreateError("");
                          }}
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          + New
                        </button>
                      </div>
                    </th>
                    <th className="p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>Raw Material Sub Category</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateMasterKey("raw-material-sub-category");
                            setMasterCreateError("");
                          }}
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          + New
                        </button>
                      </div>
                    </th>
                    <th className="p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>Raw Material Name</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateMasterKey("raw-material");
                            setMasterCreateError("");
                          }}
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          + New
                        </button>
                      </div>
                    </th>
                    <th className="p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>Size</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateMasterKey("size");
                            setMasterCreateError("");
                          }}
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          + New
                        </button>
                      </div>
                    </th>
                    <th className="p-2">Consumption</th>
                    <th className="p-2">Required Qty</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.bomRows.map((row, index) => (
                    <tr key={`${index}-${row.rawMaterialName || "row"}`}>
                      <td className="p-2">
                        {renderMasterSelect(row.categoryType, (val) => updateBomRow(index, "categoryType", val), "raw-material-type", "Select type")}
                      </td>
                      <td className="p-2">
                        {renderMasterSelect(row.category, (val) => updateBomRow(index, "category", val), "raw-material-category", "Select category")}
                      </td>
                      <td className="p-2">
                        {renderMasterSelect(row.subCategory, (val) => updateBomRow(index, "subCategory", val), "raw-material-sub-category", "Select sub category", row.category)}
                      </td>
                      <td className="p-2">
                        {renderMasterSelect(row.rawMaterialName, (val) => updateBomRow(index, "rawMaterialName", val), "raw-material", "Select raw material")}
                      </td>
                      <td className="p-2">
                        {renderMasterSelect(row.size, (val) => updateBomRow(index, "size", val), "size", "Select size")}
                      </td>
                      <td className="p-2"><input type="number" value={row.consumption} onChange={(event) => updateBomRow(index, "consumption", event.target.value)} placeholder="0.00" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><input type="number" value={row.requiredQty} onChange={(event) => updateBomRow(index, "requiredQty", event.target.value)} placeholder="0.00" className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="p-2"><button type="button" onClick={() => removeBomRow(index)} className="text-red-600 hover:text-red-700 font-medium">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          {saveError ? <p className="text-xs text-red-600 self-center">{saveError}</p> : null}
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : orderId ? "Update Order" : "Save Order"}
          </button>
        </div>
      </form>

      {/* Master creation modal */}
      {createMasterKey ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Add New Master: {createMasterKey}</h3>
            <form onSubmit={handleCreateMasterSubmit} className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Label</span>
                <input
                  type="text"
                  required
                  value={createMasterLabel}
                  onChange={(e) => setCreateMasterLabel(e.target.value)}
                  placeholder="Enter name..."
                  className="rounded border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Code (Optional)</span>
                <input
                  type="text"
                  value={createMasterCode}
                  onChange={(e) => setCreateMasterCode(e.target.value)}
                  placeholder="Enter code..."
                  className="rounded border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Description (Optional)</span>
                <textarea
                  value={createMasterDescription}
                  onChange={(e) => setCreateMasterDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="rounded border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </label>
              {masterCreateError ? <p className="text-xs text-red-600">{masterCreateError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeMasterCreate}
                  className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMaster}
                  className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creatingMaster ? "Creating..." : "Create Option"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}