"use client";

import React, { useMemo, useState } from "react";
import { calculateBomRows, calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";

type BomRow = {
  id?: string;
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  size?: string | null;
  buyerConsumption?: number | string | null;
  buyerPrice?: number | string | null;
  internalConsumption?: number | string | null;
  internalPrice?: number | string | null;
  valuePerGarmentRm?: number | string | null;
  consumption?: number | string | null;
  requiredQty?: number | string | null;
  itemWiseExcessPercentage?: number | string | null;
  itemWiseExcessQty?: number | string | null;
  totalRequiredQty?: number | string | null;
};

const defaultBomRow = (categoryOverride?: string): BomRow => ({
  categoryType: "",
  category: categoryOverride ?? "",
  subCategory: "",
  rawMaterialName: "",
  size: "",
  consumption: "",
  requiredQty: "",
  itemWiseExcessPercentage: "",
  itemWiseExcessQty: "",
  totalRequiredQty: "",
});

const BOMB_CATEGORY_TEXT_MAP: Record<string, string> = {
  fabric: "Fabric",
  "main-trims": "Main Trims",
  "main trims": "Main Trims",
  "maintrims": "Main Trims",
  "sewing-trims": "Sewing Trims",
  "sewing trims": "Sewing Trims",
  "packing-trims": "Packing Trims",
  "packing trims": "Packing Trims",
  "packaging-trims": "Packing Trims",
  "packaging trims": "Packing Trims",
  "packing": "Packing Trims",
};

const normalizeBomCategory = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Uncategorized";

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return "Uncategorized";

  return BOMB_CATEGORY_TEXT_MAP[normalized] ?? trimmed;
};

export default function BomTab({
  form,
  setForm,
  renderMasterSelect,
  onOpenCreateMaster,
  masterOptions,
}: {
  form: any;
  setForm: any;
  renderMasterSelect?: (
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string,
    parentCategoryValue?: string
  ) => React.ReactNode;
  onOpenCreateMaster?: (masterKey: string) => void;
  masterOptions?: Record<string, Array<{ id?: string; label?: string; value_id?: string; name?: string; parent_id?: string | null; parentValueId?: string | null; is_active?: boolean }>>;
}) {
  const bomRows = form?.bomRows?.length > 0 ? form.bomRows : [defaultBomRow()];
  const finishedGoods = calculateFinishedGoodsRows(form?.rows ?? []);
  const calculatedBomRows = calculateBomRows(bomRows, finishedGoods.rows, finishedGoods.orderQty);
  const [selectedBomCategory, setSelectedBomCategory] = useState<string>("All");

  const bomCategories = useMemo(() => {
    const categorySet = new Set<string>(["All"]);

    for (const option of masterOptions?.["raw-material-category"] ?? []) {
      const label = String(option.label ?? option.name ?? "").trim();
      if (label) {
        categorySet.add(normalizeBomCategory(label));
      }
    }

    for (const row of calculatedBomRows) {
      const normalized = normalizeBomCategory(String(row.category ?? ""));
      if (normalized && normalized !== "Uncategorized") {
        categorySet.add(normalized);
      }
    }

    return Array.from(categorySet);
  }, [calculatedBomRows, masterOptions]);

  const visibleBomRows = useMemo(() => {
    if (selectedBomCategory === "All") return calculatedBomRows;
    return calculatedBomRows.filter((row) => normalizeBomCategory(String(row.category ?? "")) === selectedBomCategory);
  }, [calculatedBomRows, selectedBomCategory]);

  const addBomRow = () => {
    const nextCategory = selectedBomCategory !== "All" ? selectedBomCategory : "";
    setForm((current: any) => ({
      ...current,
      bomRows: [...(current.bomRows || []), defaultBomRow(nextCategory)],
    }));
  };

  const removeBomRow = (index: number) => {
    setForm((current: any) => ({
      ...current,
      bomRows: (current.bomRows || []).filter((_: any, i: number) => i !== index),
    }));
  };

  const updateBomRow = (index: number, field: keyof BomRow, value: string) => {
    setForm((current: any) => {
      const updatedRows = [...(current.bomRows || [])];
      const currentRow = updatedRows[index] ?? {};
      updatedRows[index] = { ...currentRow, [field]: value };

      if (field === "category") {
        const nextCategory = String(value ?? "").trim();
        const validSubCategories = getFilteredSubCategoryOptions(nextCategory);
        const currentSubCategory = String(currentRow.subCategory ?? "").trim();

        const hasValidSubCategory = validSubCategories.some((option: any) => {
          const label = String(option.label ?? option.name ?? "").trim();
          return label === currentSubCategory;
        });

        updatedRows[index].subCategory = nextCategory && currentSubCategory && !hasValidSubCategory ? "" : currentSubCategory;
      }

      return { ...current, bomRows: updatedRows };
    });
  };

  const getFilteredSubCategoryOptions = (categoryValue: string) => {
    if (!masterOptions) return [];

    const normalizeOptionText = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const categoryOptions = masterOptions["raw-material-category"] ?? [];
    const targetCategoryText = normalizeOptionText(categoryValue);

    if (!targetCategoryText) {
      return [];
    }

    const selectedCategory = categoryOptions.find((option: any) => {
      const optionText = normalizeOptionText(option.label ?? option.name ?? "");
      const normalizedCategory = normalizeBomCategory(String(option.label ?? option.name ?? ""));
      return optionText === targetCategoryText || normalizedCategory === normalizeBomCategory(categoryValue);
    });

    if (!selectedCategory) {
      return [];
    }

    const selectedCategoryIds = new Set(
      [selectedCategory?.id, selectedCategory?.value_id, selectedCategory?.parent_id, selectedCategory?.parentValueId]
        .filter(Boolean)
        .map((value) => String(value)),
    );

    const subCategoryOptions = masterOptions["raw-material-sub-category"] ?? [];

    return subCategoryOptions.filter((option: any) => {
      const optionParentIds = [option.parent_id, option.parentValueId].filter(Boolean).map((value) => String(value));
      const parentLabel = String(option.parent_label ?? option.parentName ?? option.parent ?? "").trim();
      const categoryLabel = String(option.category ?? option.categoryName ?? "").trim();

      return optionParentIds.some((parentId) => selectedCategoryIds.has(parentId))
        || normalizeOptionText(parentLabel) === targetCategoryText
        || normalizeOptionText(categoryLabel) === targetCategoryText
        || normalizeBomCategory(parentLabel) === normalizeBomCategory(categoryValue)
        || normalizeBomCategory(categoryLabel) === normalizeBomCategory(categoryValue);
    });
  };

  const getFilteredRawMaterialOptions = (categoryValue: string, subCategoryValue: string) => {
    if (!masterOptions || !subCategoryValue) return [];

    const normalizeOptionText = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const rawMaterialOptions = masterOptions["raw-material"] ?? [];
    const subCategoryOptions = masterOptions["raw-material-sub-category"] ?? [];

    const selectedSubCategory = subCategoryOptions.find((option: any) => {
      const optionLabel = String(option.label ?? option.name ?? "").trim();
      return normalizeOptionText(optionLabel) === normalizeOptionText(subCategoryValue);
    });

    if (!selectedSubCategory) {
      return [];
    }

    const selectedSubCategoryIds = new Set(
      [selectedSubCategory?.id, selectedSubCategory?.value_id, selectedSubCategory?.parent_id, selectedSubCategory?.parentValueId]
        .filter(Boolean)
        .map((value) => String(value)),
    );

    return rawMaterialOptions.filter((option: any) => {
      const optionParentIds = [option.parent_id, option.parentValueId].filter(Boolean).map((value) => String(value));
      const optionCategory = String(option.category ?? option.categoryName ?? "").trim();
      const optionSubCategory = String(option.subCategory ?? option.sub_category ?? "").trim();

      return optionParentIds.some((parentId) => selectedSubCategoryIds.has(parentId))
        || normalizeOptionText(optionSubCategory) === normalizeOptionText(subCategoryValue)
        || normalizeOptionText(optionCategory) === normalizeOptionText(categoryValue);
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Bill of Materials</h3>
          <p className="mt-1 text-[11px] text-slate-500">Category tabs filter the view while keeping every BOM row in the same table data.</p>
        </div>
        <button
          type="button"
          onClick={addBomRow}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          + Add Row
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        {bomCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedBomCategory(category)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
              selectedBomCategory === category
                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200 bg-slate-50/40 shadow-inner">
        <table className="min-w-[1200px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[210px]" />
            <col className="w-[220px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[90px]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-white text-slate-600">
            <tr>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">
                <div className="flex items-center justify-between gap-2">
                  <span>RM Sub Category</span>
                  {onOpenCreateMaster && (
                    <button
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material-sub-category")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </button>
                  )}
                </div>
              </th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">
                <div className="flex items-center justify-between gap-2">
                  <span>Raw Material Name</span>
                  {onOpenCreateMaster && (
                    <button
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </button>
                  )}
                </div>
              </th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">
                <div className="flex items-center justify-between gap-2">
                  <span>Size</span>
                  {onOpenCreateMaster && (
                    <button
                      type="button"
                      onClick={() => onOpenCreateMaster("size")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </button>
                  )}
                </div>
              </th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Buyer Cons.</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Buyer Price</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Internal Cons.</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Internal Price</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Required Qty</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Excess %</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Excess Qty</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Total Required Qty</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleBomRows.map((row: BomRow, index: number) => (
              <tr key={`${index}-${row.rawMaterialName || "row"}`} className="bg-white">
                <td className="p-2 align-top">
                  {renderMasterSelect ? (() => {
                    const filteredSubCategories = getFilteredSubCategoryOptions(String(row.category ?? ""));
                    const safeOptions = filteredSubCategories.filter((option: any) => option.label || option.name);
                    const value = String(row.subCategory ?? "");

                    return (
                      <select
                        value={value}
                        onChange={(event) => updateBomRow(index, "subCategory", event.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="">Select sub category</option>
                        {safeOptions.map((option: any) => (
                          <option key={option.id ?? option.label ?? option.name} value={option.label ?? option.name ?? ""}>
                            {option.label ?? option.name}
                          </option>
                        ))}
                      </select>
                    );
                  })() : (
                    <input
                      value={row.subCategory || ""}
                      onChange={(e) => updateBomRow(index, "subCategory", e.target.value)}
                      placeholder="Sub Category"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="p-2 align-top">
                  {renderMasterSelect ? (() => {
                    const filteredRawMaterials = getFilteredRawMaterialOptions(String(row.category ?? ""), String(row.subCategory ?? ""));
                    const safeOptions = filteredRawMaterials.length > 0 ? filteredRawMaterials : [];
                    const value = String(row.rawMaterialName ?? "");

                    return (
                      <select
                        value={value}
                        onChange={(event) => updateBomRow(index, "rawMaterialName", event.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="">{row.subCategory ? "Select raw material" : "Select sub category first"}</option>
                        {safeOptions.map((option: any) => (
                          <option key={option.id ?? option.label ?? option.name} value={option.label ?? option.name ?? ""}>
                            {option.label ?? option.name}
                          </option>
                        ))}
                      </select>
                    );
                  })() : (
                    <input
                      value={row.rawMaterialName || ""}
                      onChange={(e) => updateBomRow(index, "rawMaterialName", e.target.value)}
                      placeholder="Name"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="min-w-[180px] whitespace-nowrap p-2 align-top">
                  {renderMasterSelect ? (
                    renderMasterSelect(
                      row.size ?? "",
                      (val) => updateBomRow(index, "size", val),
                      "size",
                      "Select size"
                    )
                  ) : (
                    <input
                      value={row.size || ""}
                      onChange={(e) => updateBomRow(index, "size", e.target.value)}
                      placeholder="Size"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.buyerConsumption || ""}
                    onChange={(e) => updateBomRow(index, "buyerConsumption", e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.buyerPrice || ""}
                    onChange={(e) => updateBomRow(index, "buyerPrice", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.internalConsumption || ""}
                    onChange={(e) => updateBomRow(index, "internalConsumption", e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.internalPrice || ""}
                    onChange={(e) => updateBomRow(index, "internalPrice", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.requiredQty || ""}
                    readOnly
                    placeholder="0"
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.itemWiseExcessPercentage || ""}
                    onChange={(e) => updateBomRow(index, "itemWiseExcessPercentage", e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.itemWiseExcessQty || ""}
                    readOnly
                    placeholder="0"
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <input
                    type="number"
                    value={row.totalRequiredQty || ""}
                    readOnly
                    placeholder="0"
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <button
                    type="button"
                    onClick={() => removeBomRow(index)}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}