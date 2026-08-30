"use client";

import { startTransition, type FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";

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
  const response = await fetch(`/api/masters?organizationId=${encodeURIComponent(organizationId)}&includeInactive=true`);
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

export default function NewOrderPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; orderId?: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const orderId = params?.orderId ?? "";

  const [activeTab, setActiveTab] = useState<"details" | "finishedGoods">("details");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm, rows: [defaultSizeRow()] });
  const [loading, setLoading] = useState(Boolean(orderId));
  const [masterOptions, setMasterOptions] = useState<Record<string, MasterOption[]>>({});
  const [orderLookups, setOrderLookups] = useState<OrderLookupDefinition[]>([]);
  const [createMasterKey, setCreateMasterKey] = useState<string | null>(null);
  const [createMasterLabel, setCreateMasterLabel] = useState("");
  const [createMasterCode, setCreateMasterCode] = useState("");
  const [createMasterDescription, setCreateMasterDescription] = useState("");
  const [creatingMaster, setCreatingMaster] = useState(false);
  const [masterCreateError, setMasterCreateError] = useState("");

  useEffect(() => {
    const loadMasters = async () => {
      try {
        const masters = await fetchMasterOptions(organizationId);
        setMasterOptions(masters.options);
        setOrderLookups(masters.orderLookups);
      } catch (error) {
        console.error("Unable to load master lookup data", error);
      }
    };

    loadMasters();
  }, [organizationId]);

  useEffect(() => {
    if (!orderId) {
      startTransition(() => {
        setForm({ ...emptyForm, rows: [defaultSizeRow()] });
        setLoading(false);
      });
      return;
    }

    const loadOrder = async () => {
      try {
        const response = await fetch(`/api/orders?organizationId=${encodeURIComponent(organizationId)}`);
        const data = await response.json();
        const found = (data.orders ?? []).find((item: OrderRecord) => item.id === orderId);

        if (found) {
          setForm(mapOrderToForm(found));
        }
      } catch (error) {
        console.error("Unable to load order", error);
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [orderId, organizationId]);

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
      <label >
        <span >
          <span>{label}</span>
          <button
            type="button"
            onClick={() => {
              setCreateMasterKey(masterKey);
              setMasterCreateError("");
            }}
            
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

      router.push(`/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`);
    } catch (error) {
      console.error("Save failed", error);
      setSaveError(error instanceof Error ? error.message : "Unable to save this order.");
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    router.push(`/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`);
  };

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName="Credence Craft"
      value="order-management"
      moduleLabel="Order Management"
      title={orderId ? "Edit Order" : "Create Order"}
      description={orderId ? "Edit the selected order." : "Create a new order record."}
      subItems={[
        { key: "home", label: "Home", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management` },
        { key: "merchandising", label: "Merchandising", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising` },
        { key: "purchase", label: "Purchase", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/purchase` },
      ]}
    >
      <div >
        <div >
          <div>
            <p >{orderId ? "Edit Order" : "Create Order"}</p>
            <h2 >{form.orderNo || "New Order"}</h2>
          </div>
          <div >
            <span >
              {form.finalStatus}
            </span>
            <button
              type="button"
              onClick={goBack}
              
            >
              Back to Report
            </button>
          </div>
        </div>

        {loading ? (
          <div >Loading order...</div>
        ) : (
          <form onSubmit={handleSubmit} >
            <div >
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
              <div >
                <label >
                  <span >Order No</span>
                  <input value={form.orderNo} onChange={(event) => handleChange("orderNo", event.target.value)}  placeholder="Order_No" />
                </label>
                {masterSelect("Entity Name", form.entityName, (value) => handleChange("entityName", value), "entity", "Select entity")}
                {masterSelect("Category", form.category, (value) => handleChange("category", value), "category", "Select category")}
                {masterSelect("Sub Category", form.subCategory, (value) => handleChange("subCategory", value), "sub-category", "Select sub category")}
                {masterSelect("Season", form.season, (value) => handleChange("season", value), "season", "Select season")}
                {masterSelect("Article", form.article, (value) => handleChange("article", value), "article", "Select article")}
                <label >
                  <span >Style Name</span>
                  <input value={form.styleName} onChange={(event) => handleChange("styleName", event.target.value)}  placeholder="Style_Name" />
                </label>
                {masterSelect("Colors", form.colors, (value) => handleChange("colors", value), "color", "Select color")}
                {masterSelect("Buyer", form.buyer, (value) => handleChange("buyer", value), "buyer", "Select buyer")}
                {masterSelect("Brand", form.brand, (value) => handleChange("brand", value), "brand", "Select brand")}
                {masterSelect("Size Group", form.sizeGroup, (value) => handleChange("sizeGroup", value), "size-group", "Select size group")}
                <label ><input type="checkbox" checked={form.haveSizeRatio} onChange={(event) => setForm((current) => ({ ...current, haveSizeRatio: event.target.checked }))} /> Have Size Ratio</label>
                <label >
                  <span >Ratio Order Qty</span>
                  <input type="number" value={form.ratioOrderQty} onChange={(event) => handleChange("ratioOrderQty", event.target.value)}  placeholder="Ratio_Order_Qty" />
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
                          <td ><input value={row.buyerSize} onChange={(event) => updateSizeRow(index, "buyerSize", event.target.value)}  placeholder="Buyer Size" /></td>
                          <td >
                            <select
                              value={row.size}
                              onChange={(event) => updateSizeRow(index, "size", event.target.value)}
                              
                            >
                              <option value="">Select size</option>
                              {(masterOptions.size ?? []).map((option) => (
                                <option key={option.id} value={option.label}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td ><input type="number" value={row.beforeExcessQty} onChange={(event) => updateSizeRow(index, "beforeExcessQty", event.target.value)}  placeholder="0" /></td>
                          <td ><input type="number" value={row.excess} onChange={(event) => updateSizeRow(index, "excess", event.target.value)}  placeholder="0" /></td>
                          <td ><input type="number" value={row.excessQty} onChange={(event) => updateSizeRow(index, "excessQty", event.target.value)}  placeholder="0" /></td>
                          <td ><input type="number" value={row.totalQty} onChange={(event) => updateSizeRow(index, "totalQty", event.target.value)}  placeholder="0" /></td>
                          <td ><input type="number" value={row.buyerPoPrice} onChange={(event) => updateSizeRow(index, "buyerPoPrice", event.target.value)}  placeholder="0.00" /></td>
                          <td ><input type="number" value={row.exchangePrice} onChange={(event) => updateSizeRow(index, "exchangePrice", event.target.value)}  placeholder="0.00" /></td>
                          <td ><input type="number" value={row.priceInInr} onChange={(event) => updateSizeRow(index, "priceInInr", event.target.value)}  placeholder="0.00" /></td>
                          <td ><button type="button" onClick={() => removeSizeRow(index)} >Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {saveError ? <div >{saveError}</div> : null}

            <div >
              <button type="button" onClick={goBack} >Back to Report</button>
              <button type="button" onClick={() => setForm({ ...emptyForm, rows: [defaultSizeRow()] })} >Reset</button>
              <button type="submit" disabled={saving} >
                {saving ? "Saving..." : orderId ? "Update Order" : "Save Order"}
              </button>
            </div>
          </form>
        )}
      </div>

      {createMasterKey ? (
        <div >
          <div >
            <div >
              <div>
                <p >Create master</p>
                <h3 >Add {createMasterKey.replace(/-/g, " ")}</h3>
              </div>
              <button type="button" onClick={closeMasterCreate} >
                Close
              </button>
            </div>

            <form onSubmit={handleMasterCreate} >
              <label >
                <span>Name</span>
                <input
                  value={createMasterLabel}
                  onChange={(event) => setCreateMasterLabel(event.target.value)}
                  required
                  autoFocus
                  
                />
              </label>
              <label >
                <span>Code</span>
                <input
                  value={createMasterCode}
                  onChange={(event) => setCreateMasterCode(event.target.value)}
                  
                />
              </label>
              <label >
                <span>Description</span>
                <textarea
                  value={createMasterDescription}
                  onChange={(event) => setCreateMasterDescription(event.target.value)}
                  rows={3}
                  
                />
              </label>
              {masterCreateError ? <p >{masterCreateError}</p> : null}
              <div >
                <button type="button" onClick={closeMasterCreate} >
                  Cancel
                </button>
                <button type="submit" disabled={creatingMaster} >
                  {creatingMaster ? "Creating..." : "Create master"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </MasterModuleShell>
  );
}
