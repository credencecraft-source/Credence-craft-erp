"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getMasterDefinition, type MasterFieldDefinition } from "@/lib/master-data/master-data-definitions";
import OrderDetailsTab from "./components/OrderDetailsTab";
import FinishedGoodsTab from "./components/FinishedGoodsTab";
import BomTab from "./components/BomTab";
import CostingTab from "./components/costing";
import TecPackTab from "./components/Tecpack";
import MeasurementsTab from "./components/MeasurementsTab";
import ProcessTab from "./components/ProcessTab";
import AttachmentsTab from "./components/Attachments";

type TabType = "details" | "finishedGoods" | "bom" | "costing" | "techPack" | "measurements" | "process" | "attachments";
type QuickMasterParent = {
  masterKey: string;
  fields: Record<string, unknown>;
  lookupOptions: Record<string, any[]>;
  returnFieldKey: string;
};

export default function MerchandisingOrderDetailsPage() {
  const params = useParams<{
    workspaceId: string;
    organizationId: string;
    orderId?: string;
  }>();

  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params?.orderId && params.orderId !== "create" ? params.orderId : undefined;
  const cloneFrom = searchParams.get("cloneFrom");
  const workspaceId = params?.workspaceId;
  const organizationId = params?.organizationId;

  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [isSaving, setIsSaving] = useState(false);
  const [newMasterKey, setNewMasterKey] = useState<string | null>(null);
  const [quickMasterFields, setQuickMasterFields] = useState<Record<string, unknown>>({});
  const [quickMasterLookupOptions, setQuickMasterLookupOptions] = useState<Record<string, any[]>>({});
  const [quickMasterStack, setQuickMasterStack] = useState<QuickMasterParent[]>([]);
  const [isCreatingMaster, setIsCreatingMaster] = useState(false);
  const [masterCreateError, setMasterCreateError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Master Data & Lookups State
  const [masterOptions, setMasterOptions] = useState<Record<string, any[]>>({});
  const [orderLookups, setOrderLookups] = useState<any[]>([]);

  const [form, setForm] = useState({
    rows: [] as any[],
    bomRows: [] as any[],
    costingRows: [] as any[],
    techPackRows: [] as any[],
    measurementRows: [] as any[],
    processRows: [] as any[],
    attachmentRows: [] as any[],
    orderQty: 1,
    sellingPricePerPcs: 0,
    orderNo: "",
    article: "",
    entityName: "",
    category: "",
    subCategory: "",
    season: "",
    styleName: "",
    colors: "",
    buyer: "",
    brand: "",
    sizeGroup: "",
    haveSizeRatio: false,
    ratioOrderQty: "",
    deliveryDate: "",
    finalStatus: "Draft",
    processStatus: "Draft",
  });

  const fetchMasterData = async (orgId: string) => {
    try {
      const lookupsRes = await fetch(`/api/organizations/${orgId}/master-data/order-lookups`, { cache: "no-store" });
      if (lookupsRes.ok) {
        const lookupData = await lookupsRes.json();
        setMasterOptions(lookupData.masterOptions ?? {});
        setOrderLookups(
          Array.isArray(lookupData)
            ? lookupData
            : lookupData.orderLookups ?? lookupData.items ?? [],
        );
      }
    } catch (error) {
      console.error("Error fetching master options:", error);
    }
  };

  // Fetch on mount and re-fetch when window regains focus (e.g., coming back from creating a master)
  useEffect(() => {
    if (organizationId) {
      fetchMasterData(organizationId);

      const handleFocus = () => {
        fetchMasterData(organizationId);
      };
      window.addEventListener("focus", handleFocus);
      return () => window.removeEventListener("focus", handleFocus);
    }
  }, [organizationId]);

  useEffect(() => {
    const existingOrderId = orderId || cloneFrom;
    if (!existingOrderId || !organizationId) return;
    const sourceOrderId = existingOrderId;

    let isMounted = true;

    async function loadOrder() {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(sourceOrderId)}?organizationId=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load order.");
        }

        const order = data.order;
        if (!isMounted || !order) return;

        const clonedRows = (order.finishedGoods ?? []).map((row: Record<string, unknown>) => ({
          ...row,
          beforeExcessQty: "",
          excess: "",
          excessQty: "",
          totalQty: "",
          buyerPoPrice: row.buyerPoPrice ?? "",
          exchangePrice: row.exchangePrice ?? "",
          priceInInr: row.priceInInr ?? "",
        }));

        setForm((current) => ({
          ...current,
          ...order,
          ...(cloneFrom
            ? {
                orderNo: "",
                article: "",
                styleName: "",
                orderQty: "",
                ratioOrderQty: "",
                finalStatus: "Draft",
                processStatus: "Draft",
                rows: clonedRows,
              }
            : {}),
          deliveryDate: order.deliveryDate ? String(order.deliveryDate).slice(0, 10) : "",
          ratioOrderQty: cloneFrom ? "" : order.ratioOrderQty ?? "",
          orderQty: cloneFrom ? "" : order.orderQty ?? "",
          rows: (cloneFrom ? clonedRows : order.finishedGoods ?? []).map((row: Record<string, unknown>) => ({
            ...row,
            beforeExcessQty: row.beforeExcessQty ?? "",
            excess: row.excess ?? "",
            excessQty: row.excessQty ?? "",
            totalQty: row.totalQty ?? "",
            buyerPoPrice: row.buyerPoPrice ?? "",
            exchangePrice: row.exchangePrice ?? "",
            priceInInr: row.priceInInr ?? "",
          })),
          bomRows: order.bomItems ?? [],
        }));
      } catch (error) {
        if (isMounted) {
          alert(error instanceof Error ? error.message : "Unable to load order.");
        }
      }
    }

    loadOrder();
    return () => {
      isMounted = false;
    };
  }, [cloneFrom, orderId, organizationId]);

  // Handler to open/redirect to create master view using the `+ New` button
  const handleOpenCreateMaster = async (masterKey: string, returnFieldKey?: string) => {
    const definition = getMasterDefinition(masterKey);
    if (!definition) return;

    if (newMasterKey && returnFieldKey) {
      setQuickMasterStack((current) => [
        ...current,
        { masterKey: newMasterKey, fields: quickMasterFields, lookupOptions: quickMasterLookupOptions, returnFieldKey },
      ]);
    }
    setNewMasterKey(masterKey);
    setQuickMasterFields(Object.fromEntries(definition.fields.map((field) => [field.key, field.type === "checkbox" ? false : field.multiple ? [] : ""])));
    setMasterCreateError("");

    const lookupKeys = [...new Set(definition.fields.filter((field) => field.type === "lookup" && field.lookupModuleKey).map((field) => field.lookupModuleKey as string))];
    const lookupResults = await Promise.all(lookupKeys.map(async (lookupKey) => {
      try {
        const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(lookupKey)}`, { cache: "no-store" });
        const data = response.ok ? await response.json() : [];
        return [lookupKey, Array.isArray(data) ? data : data.items ?? []] as const;
      } catch {
        return [lookupKey, []] as const;
      }
    }));
    setQuickMasterLookupOptions(Object.fromEntries(lookupResults));
  };

  const handleCreateMaster = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !newMasterKey) return;

    const definition = getMasterDefinition(newMasterKey);
    const labelKey = definition?.labelField ?? definition?.fields[0]?.key;
    const label = labelKey ? String(quickMasterFields[labelKey] ?? "").trim() : "";
    if (!definition || !label) return;

    try {
      setIsCreatingMaster(true);
      setMasterCreateError("");
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(newMasterKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          fields: quickMasterFields,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to create master value.");
      }

      const refreshedResponse = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/order-lookups`, { cache: "no-store" });
      if (refreshedResponse.ok) {
        const refreshedData = await refreshedResponse.json();
        setMasterOptions(refreshedData.masterOptions ?? {});
        setOrderLookups(refreshedData.orderLookups ?? []);
      }

      const formFieldByMasterKey: Record<string, string> = {
        article: "article",
        entity: "entityName",
        category: "category",
        "sub-category": "subCategory",
        season: "season",
        color: "colors",
        buyer: "buyer",
        brand: "brand",
        "size-group": "sizeGroup",
      };
      const formField = formFieldByMasterKey[newMasterKey];
      const previousMaster = quickMasterStack.at(-1);
      if (previousMaster) {
        const previousDefinition = getMasterDefinition(previousMaster.masterKey);
        const previousField = previousDefinition?.fields.find((field) => field.key === previousMaster.returnFieldKey);
        const lookupKey = previousField?.lookupModuleKey;
        const restoredLookupOptions = { ...previousMaster.lookupOptions };
        if (lookupKey) {
          restoredLookupOptions[lookupKey] = [
            ...(restoredLookupOptions[lookupKey] ?? []).filter((option) => option.label !== label),
            { id: data?.id ?? data?.value_id ?? label, label },
          ];
        }
        setQuickMasterFields({ ...previousMaster.fields, [previousMaster.returnFieldKey]: label });
        setQuickMasterLookupOptions(restoredLookupOptions);
        setQuickMasterStack((current) => current.slice(0, -1));
        setNewMasterKey(previousMaster.masterKey);
        setMasterCreateError("");
      } else if (formField) {
        setForm((current) => ({ ...current, [formField]: label }));
        setNewMasterKey(null);
      } else {
        setNewMasterKey(null);
      }
    } catch (error) {
      setMasterCreateError(error instanceof Error ? error.message : "Unable to create master value.");
    } finally {
      setIsCreatingMaster(false);
    }
  };

  const closeQuickMaster = () => {
    setNewMasterKey(null);
    setQuickMasterStack([]);
    setMasterCreateError("");
  };

  const handleSizeGroupChange = (sizeGroup: string) => {
    const selectedGroup = (masterOptions["size-group"] ?? []).find((group: any) => group.label === sizeGroup || group.id === sizeGroup || group.value_id === sizeGroup);
    const mappedSizes = Array.isArray(selectedGroup?.sizes) ? selectedGroup.sizes : [];
    setForm((current: any) => ({
      ...current,
      sizeGroup,
      rows: mappedSizes.length > 0
        ? mappedSizes.map((size: any) => ({
            buyerSize: "",
            size: String(size.label ?? size.name ?? size ?? "").trim(),
            beforeExcessQty: "",
            excess: "",
            excessQty: "",
            totalQty: "",
            buyerPoPrice: "",
            exchangePrice: "",
            priceInInr: "",
          })).filter((row: any) => row.size)
        : [],
    }));
  };

  const renderBomMasterSelect = (
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string,
    parentValue?: string,
  ) => {
    let options = masterOptions[masterKey] ?? [];
    if (parentValue) {
      const parentOption = (masterOptions["raw-material-category"] ?? []).find((option: any) => option.label === parentValue);
      if (parentOption) {
        options = options.filter((option: any) => option.parent_id === parentOption.id || option.parentValueId === parentOption.id);
      }
    }
    if (value && !options.some((option: any) => option.label === value)) {
      options = [{ id: "legacy-bom-value", label: value, is_active: true }, ...options];
    }
    return (
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 shadow-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((option: any) => (
          <option key={option.id ?? option.label} value={option.label}>
            {option.label}{option.is_active === false ? " (Not approved)" : ""}
          </option>
        ))}
      </select>
    );
  };

  const renderQuickMasterField = (field: MasterFieldDefinition) => {
    const value = quickMasterFields[field.key];
    const setValue = (nextValue: unknown) => setQuickMasterFields((current) => ({ ...current, [field.key]: nextValue }));

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={value === true} onChange={(event) => setValue(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
          {field.label}
        </label>
      );
    }

    if (field.type === "picklist" || field.type === "lookup") {
      let options = field.type === "lookup" ? quickMasterLookupOptions[field.lookupModuleKey ?? ""] ?? [] : (field.options ?? []).map((option) => ({ id: option, label: option }));
      if (field.dependsOn) {
        const parentValue = String(quickMasterFields[field.dependsOn] ?? "");
        const currentDefinition = newMasterKey ? getMasterDefinition(newMasterKey) : null;
        const parentField = currentDefinition?.fields.find((candidate) => candidate.key === field.dependsOn);
        const parentOptions = quickMasterLookupOptions[parentField?.lookupModuleKey ?? ""] ?? [];
        const parentOption = parentOptions.find((option) => option.label === parentValue);
        if (parentOption) {
          const parentIds = new Set(
            [parentOption.id, parentOption.value_id]
              .filter(Boolean)
              .map((value) => String(value)),
          );
          options = options.filter((option) => {
            const optionParentIds = [option.parent_id, option.parentValueId]
              .filter(Boolean)
              .map((value) => String(value));
            return optionParentIds.some((value) => parentIds.has(value))
              || option.parent_label === parentOption.label;
          });
        } else if (parentValue) {
          options = [];
        }
      }
      if (field.type === "lookup" && field.multiple) {
        const selectedValues = Array.isArray(value) ? value.map(String) : [];
        return (
          <div key={field.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>{field.label}{field.required ? " *" : ""}</span>
              <span className="font-normal text-slate-500">{selectedValues.length} selected</span>
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {options.length === 0 ? (
                <p className="px-2 py-1 text-xs font-normal text-slate-500">No Size records available.</p>
              ) : (
                options.map((option) => {
                  const optionValue = String(option.label);
                  const checked = selectedValues.includes(optionValue);
                  return (
                    <label key={option.id ?? option.label} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs font-normal hover:bg-emerald-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setValue(checked ? selectedValues.filter((item) => item !== optionValue) : [...selectedValues, optionValue])}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        );
      }
      return (
        <label key={field.key} className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <span className="flex items-center justify-between">
            <span>{field.label}{field.required ? " *" : ""}</span>
            {field.type === "lookup" && field.lookupModuleKey && (
              <button type="button" onClick={() => handleOpenCreateMaster(field.lookupModuleKey as string, field.key)} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700">
                + New
              </button>
            )}
          </span>
          <select required={field.required} multiple={field.multiple} value={field.multiple ? (Array.isArray(value) ? value.map(String) : []) : String(value ?? "")} onChange={(event) => {
            const nextValue = field.multiple ? Array.from(event.target.selectedOptions, (option) => option.value) : event.target.value;
            setValue(nextValue);
            const currentDefinition = newMasterKey ? getMasterDefinition(newMasterKey) : null;
            for (const dependentField of currentDefinition?.fields.filter((candidate) => candidate.dependsOn === field.key) ?? []) {
              setQuickMasterFields((current) => ({ ...current, [dependentField.key]: dependentField.multiple ? [] : "" }));
            }
          }} className={`rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal focus:border-emerald-500 focus:outline-none${field.multiple ? " min-h-28" : ""}`}>
            {!field.multiple && <option value="">Select {field.label}</option>}
            {options.map((option) => <option key={option.id ?? option.label} value={option.label}>{option.label}</option>)}
          </select>
        </label>
      );
    }

    return (
      <label key={field.key} className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
        {field.label}{field.required ? " *" : ""}
        <input required={field.required} type={field.type === "number" || field.type === "percentage" || field.type === "decimal" ? "number" : field.type === "url" ? "url" : "text"} step={field.type === "percentage" || field.type === "decimal" ? "0.01" : undefined} value={String(value ?? "")} onChange={(event) => setValue(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 font-normal focus:border-emerald-500 focus:outline-none" />
      </label>
    );
  };

  const goBack = () => {
    router.back();
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      if (!form.article || form.article.trim() === "") {
        throw new Error("Blocking Field Missing: 'Article' is required.");
      }
      
      const endpoint = orderId
        ? `/api/orders/${encodeURIComponent(orderId)}?organizationId=${encodeURIComponent(organizationId)}`
        : `/api/orders?organizationId=${encodeURIComponent(organizationId)}`;
      
      const method = orderId ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderId ? { id: orderId, ...form, organizationId } : { ...form, organizationId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const serverMessage = errorData?.message || errorData?.error || `Server responded with status ${response.status}`;
        throw new Error(`Blocking Error: ${serverMessage}`);
      }

      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`);
    } catch (error: any) {
      console.error("Error saving order:", error);
      alert(error.message || "Failed to save order. Please check your inputs and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const openShareDialog = () => setShareOpen(true);

  const handleShare = async () => {
    if (!orderId) return;
    try {
      setIsSharing(true);
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceOrganizationId: organizationId }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to share order.");
      setShareOpen(false);
      alert("Order shared with the buyer. The buyer workspace has been notified.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to share order.");
    } finally {
      setIsSharing(false);
    }
  };

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "details", label: "General Details" },
    { id: "finishedGoods", label: "Finished Goods", count: form.rows.length },
    { id: "bom", label: "Bill of Materials", count: form.bomRows.length },
    { id: "costing", label: "Costing", count: form.costingRows?.length ?? 0 },
    { id: "techPack", label: "Tech Pack", count: form.techPackRows?.length ?? 0 },
    { id: "measurements", label: "Measurements", count: form.measurementRows?.length ?? 0 },
    { id: "process", label: "Process", count: form.processRows?.length ?? 0 },
    { id: "attachments", label: "Attachments", count: form.attachmentRows?.length ?? 0 },
  ];

  return (
    <div className="space-y-4 p-4 text-xs">
      {/* Header and Tab Navigation Block */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200"
            >
              ← Back
            </button>
            <h2 className="text-lg font-bold text-slate-900">
              {orderId ? "Edit Order" : "Create New Order"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {orderId && <button type="button" onClick={openShareDialog} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 font-semibold text-emerald-800 hover:bg-emerald-100">Share with Buyer</button>}
            <button type="button" onClick={handleSave} disabled={isSaving} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">{isSaving ? "Saving..." : "Save Order"}</button>
          </div>
        </div>

        {shareOpen && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center justify-between"><div><h3 className="font-bold text-emerald-950">Share with Buyer</h3><p className="mt-1 text-emerald-800">The buyer configured for this order will receive a workspace notification.</p><p className="mt-1 text-xs text-emerald-700">Internal consumption and internal price are never shared with the buyer.</p></div><button type="button" onClick={() => setShareOpen(false)} className="text-sm font-semibold text-emerald-800">Close</button></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void handleShare()} disabled={isSharing} className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{isSharing ? "Sharing..." : "Confirm and share"}</button></div></div>}
        
        {/* Scrollable Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-3 py-1.5 font-semibold rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab.label} {tab.count !== undefined && tab.count > 0 ? `(${tab.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="pt-2">
        {activeTab === "details" && (
          <OrderDetailsTab 
            form={form} 
            setForm={setForm} 
            masterOptions={masterOptions}
            orderLookups={orderLookups}
            onOpenCreateMaster={handleOpenCreateMaster}
            onSizeGroupChange={handleSizeGroupChange}
            isCreateMode={!orderId}
          />
        )}
        {activeTab === "finishedGoods" && <FinishedGoodsTab form={form} setForm={setForm} masterOptions={masterOptions} onOpenCreateMaster={handleOpenCreateMaster} />}
        {activeTab === "bom" && <BomTab form={form} setForm={setForm} renderMasterSelect={renderBomMasterSelect} onOpenCreateMaster={handleOpenCreateMaster} />}
        {activeTab === "costing" && <CostingTab form={form} setForm={setForm} />}
        {activeTab === "techPack" && <TecPackTab form={form} setForm={setForm} />}
        {activeTab === "measurements" && <MeasurementsTab form={form} setForm={setForm} />}
        {activeTab === "process" && <ProcessTab form={form} setForm={setForm} />}
        {activeTab === "attachments" && <AttachmentsTab form={form} setForm={setForm} />}
      </div>

      {newMasterKey && getMasterDefinition(newMasterKey) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="quick-master-title">
          <form onSubmit={handleCreateMaster} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Quick create</p>
                <h3 id="quick-master-title" className="text-base font-bold text-slate-900">
                  New {getMasterDefinition(newMasterKey)?.label}
                </h3>
              </div>
              <button type="button" onClick={closeQuickMaster} className="text-lg text-slate-400 hover:text-slate-700" aria-label="Close">
                X
              </button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {getMasterDefinition(newMasterKey)?.fields.map(renderQuickMasterField)}
            </div>

            {masterCreateError && <p className="text-xs text-red-600">{masterCreateError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={closeQuickMaster} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                Cancel
              </button>
              <button type="submit" disabled={isCreatingMaster} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {isCreatingMaster ? "Creating..." : "Create and select"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}