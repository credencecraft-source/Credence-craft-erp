"use client";

import React from "react";

const dsStatusOptions = [
  "Draft",
  "Waiting For Approval",
  "Approved",
  "Waiting For Production Schedule",
  "Work Order",
  "Shipped",
  "Closed",
] as const;

export default function OrderDetailsTab({
  form,
  setForm,
  masterOptions = {},
  orderLookups = [],
  onOpenCreateMaster,
}: {
  form: any;
  setForm: any;
  masterOptions?: Record<string, any[]>;
  orderLookups?: Array<{ key: string; lookupModuleKey?: string; dependsOn?: string }>;
  onOpenCreateMaster: (masterKey: string) => void;
}) {
  const handleChange = (field: string, value: any) => {
    setForm((current: any) => {
      const updated = { ...current, [field]: value };
      if (field === "category") {
        updated.subCategory = "";
      }
      return updated;
    });
  };

  const getMasterList = (key: string) => {
    if (!masterOptions || typeof masterOptions !== "object") return [];
    
    if (masterOptions[key] && Array.isArray(masterOptions[key])) {
      return masterOptions[key];
    }

    const target = key.toLowerCase().replace(/[-_]/g, "");
    const foundKey = Object.keys(masterOptions).find((k) => {
      const normalized = k.toLowerCase().replace(/[-_]/g, "");
      return normalized === target || normalized === `${target}s` || `${normalized}s` === target;
    });

    if (foundKey && Array.isArray(masterOptions[foundKey])) {
      return masterOptions[foundKey];
    }

    return [];
  };

  const renderMasterSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string
  ) => {
    const lookupDefinition = orderLookups.find(
      (definition) => definition.lookupModuleKey === masterKey || definition.key === masterKey
    );
    
    const parentField = lookupDefinition?.dependsOn;
    const parentValue = parentField ? form[parentField] : "";
    
    let options = getMasterList(masterKey);

    if (parentField && parentValue) {
      const parentOption = Object.values(masterOptions)
        .flat()
        .find((option: any) => option && option.label === parentValue);
      
      if (parentOption) {
        options = options.filter(
          (option: any) => option.parentValueId === parentOption.id || option.parent_id === parentOption.id
        );
      } else {
        options = [];
      }
    }

    if (value && !options.some((opt: any) => opt.label === value || opt.id === value)) {
      options = [{ id: "current-legacy", label: value, code: null, is_active: true }, ...options];
    }

    return (
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>{label}</span>
          <button
            type="button"
            onClick={() => onOpenCreateMaster(masterKey)}
            className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
          >
            + New
          </button>
        </span>
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
        >
          <option value="">{placeholder}</option>
          {options.map((option: any) => (
            <option key={option.id ?? option.label} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
        General Order Information
      </h3>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-200 p-4 shadow-sm">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white text-xl shadow-sm">
          👕
        </div>
        <div className="flex-1 w-full max-w-sm">
          {renderMasterSelect(
            "Article", 
            form.article, 
            (val) => handleChange("article", val), 
            "article", 
            "Select article"
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Order No</span>
          <input
            type="text"
            value={form.orderNo ?? ""}
            onChange={(e) => handleChange("orderNo", e.target.value)}
            placeholder="Order Number"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {renderMasterSelect("Entity Name", form.entityName, (val) => handleChange("entityName", val), "entity", "Select entity")}
        {renderMasterSelect("Category", form.category, (val) => handleChange("category", val), "category", "Select category")}
        {renderMasterSelect("Sub Category", form.subCategory, (val) => handleChange("subCategory", val), "sub-category", "Select sub category")}
        {renderMasterSelect("Season", form.season, (val) => handleChange("season", val), "season", "Select season")}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Style Name</span>
          <input
            type="text"
            value={form.styleName ?? ""}
            onChange={(e) => handleChange("styleName", e.target.value)}
            placeholder="Style Name"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {renderMasterSelect("Colors", form.colors, (val) => handleChange("colors", val), "color", "Select color")}
        {renderMasterSelect("Buyer", form.buyer, (val) => handleChange("buyer", val), "buyer", "Select buyer")}
        {renderMasterSelect("Brand", form.brand, (val) => handleChange("brand", val), "brand", "Select brand")}
        {renderMasterSelect("Size Group", form.sizeGroup, (val) => handleChange("sizeGroup", val), "size-group", "Select size group")}

        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={form.haveSizeRatio ?? false}
            onChange={(e) => handleChange("haveSizeRatio", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs font-semibold text-slate-700">Have Size Ratio</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Ratio Order Qty</span>
          <input
            type="number"
            value={form.ratioOrderQty ?? ""}
            onChange={(e) => handleChange("ratioOrderQty", e.target.value)}
            placeholder="0"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Order Qty</span>
          <input
            type="number"
            value={form.orderQty ?? ""}
            onChange={(e) => handleChange("orderQty", e.target.value)}
            placeholder="0"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Delivery Date</span>
          <input
            type="date"
            value={form.deliveryDate ?? ""}
            onChange={(e) => handleChange("deliveryDate", e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Final Status</span>
          <select
            value={form.finalStatus ?? "Draft"}
            onChange={(e) => handleChange("finalStatus", e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          >
            {dsStatusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Process Status</span>
          <select
            value={form.processStatus ?? "Draft"}
            onChange={(e) => handleChange("processStatus", e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="Draft">Draft</option>
            <option value="Approved">Approved</option>
          </select>
        </label>
      </div>
    </div>
  );
}