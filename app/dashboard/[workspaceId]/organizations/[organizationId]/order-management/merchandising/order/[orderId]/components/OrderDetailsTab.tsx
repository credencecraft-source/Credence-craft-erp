"use client";

import React from "react";

export default function OrderDetailsTab({
  form,
  setForm,
  masterOptions = {},
  orderLookups = [],
  onOpenCreateMaster,
  onSizeGroupChange,
  isCreateMode = false,
}: {
  form: any;
  setForm: any;
  masterOptions?: Record<string, any[]>;
  orderLookups?: Array<{ key: string; lookupModuleKey?: string; dependsOn?: string }>;
  onOpenCreateMaster: (masterKey: string) => void;
  onSizeGroupChange?: (value: string) => void;
  isCreateMode?: boolean;
}) {
  const handleChange = (field: string, value: any) => {
    if (field === "sizeGroup" && onSizeGroupChange) {
      onSizeGroupChange(value);
      return;
    }
    setForm((current: any) => {
      const updated = { ...current, [field]: value };
      if (field === "category") {
        updated.subCategory = "";
      }
      if (field === "brand") {
        updated.sizeGroup = "";
      }
      if (field === "haveSizeRatio" && !value) {
        updated.ratioOrderQty = "";
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

    if (masterKey === "size-group" && form.brand) {
      const brandOption = getMasterList("brand").find(
        (option: any) => option.label === form.brand || option.id === form.brand || option.value_id === form.brand,
      );
      const brandIds = new Set([brandOption?.id, brandOption?.value_id].filter(Boolean));
      options = options.filter((option: any) => {
        const relatedBrand = option.fields?.Brand1 ?? option.brand_id ?? option.brandId ?? option.brand;
        return relatedBrand === form.brand || brandIds.has(relatedBrand);
      });
    }

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

  const selectedSizeGroup = String(form.sizeGroup ?? "");
  const sizeGroupOptions = Array.isArray(masterOptions["size-group"]) ? masterOptions["size-group"] : [];
  const selectedGroup = sizeGroupOptions.find((group: any) => group.label === selectedSizeGroup || group.id === selectedSizeGroup || group.value_id === selectedSizeGroup);
  const groupSizes = Array.isArray(selectedGroup?.sizes) ? selectedGroup.sizes.map((size: any) => size.label ?? size.name ?? String(size)).filter(Boolean) : [];

  return (
    <div className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
        <h3 className="text-sm font-bold text-slate-900">
          General Order Information
        </h3>
        {!isCreateMode && form.orderNo ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Order No</div>
            <div className="text-sm font-bold text-emerald-900">{form.orderNo}</div>
          </div>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {renderMasterSelect("Buyer", form.buyer, (val) => handleChange("buyer", val), "buyer", "Select buyer")}
        <div className="w-full">
          {renderMasterSelect(
            "Brand",
            form.brand,
            (val) => handleChange("brand", val),
            "brand",
            "Select brand"
          )}
        </div>
        <div className="w-full">
          {renderMasterSelect(
            "Article",
            form.article,
            (val) => handleChange("article", val),
            "article",
            "Select article"
          )}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Delivery Date</span>
          <input
            type="date"
            value={form.deliveryDate ?? ""}
            onChange={(e) => handleChange("deliveryDate", e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {renderMasterSelect("Entity Name", form.entityName, (val) => handleChange("entityName", val), "entity", "Select entity")}
        {renderMasterSelect("Product Category", form.category, (val) => handleChange("category", val), "category", "Select product category")}
        {renderMasterSelect("Product Sub Category", form.subCategory, (val) => handleChange("subCategory", val), "sub-category", "Select product sub category")}

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
        {renderMasterSelect("Season", form.season, (val) => handleChange("season", val), "season", "Select season")}
        <div className="flex flex-col gap-1.5">
          {renderMasterSelect("Size Group", form.sizeGroup, (val) => handleChange("sizeGroup", val), "size-group", "Select size group")}
          {selectedSizeGroup && groupSizes.length > 0 ? (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Available sizes</div>
              <div className="flex flex-wrap gap-1.5">
                {groupSizes.map((size: string) => (
                  <span key={size} className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                    {size}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={form.haveSizeRatio ?? false}
            onChange={(e) => handleChange("haveSizeRatio", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs font-semibold text-slate-700">Have Size Ratio</span>
        </label>

        {form.haveSizeRatio && (
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
        )}

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
      </div>
    </div>
  );
}