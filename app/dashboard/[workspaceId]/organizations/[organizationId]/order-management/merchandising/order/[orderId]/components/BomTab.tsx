"use client";

import React, { useMemo, useState } from "react";
import { calculateBomRows, calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

type BomRow = {
  id?: string;
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  stockUom?: string | null;
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
  stockUom: "",
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
  masterOptions?: Record<string, Array<{ id?: string; label?: string; value_id?: string; name?: string; parent_id?: string | null; parentValueId?: string | null; is_active?: boolean; fields?: Record<string, unknown> }>>;
}) {
  const bomRows = form?.bomRows?.length > 0 ? form.bomRows : [defaultBomRow()];
  const finishedGoods = calculateFinishedGoodsRows(form?.rows ?? []);
  const calculatedBomRows = calculateBomRows(bomRows, finishedGoods.rows, finishedGoods.orderQty);
  const [selectedBomCategory, setSelectedBomCategory] = useState<string>("All");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const isAllCategoryView = selectedBomCategory === "All";

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
    return calculatedBomRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => selectedBomCategory === "All" || normalizeBomCategory(String(row.category ?? "")) === selectedBomCategory);
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
    const selectedCategoryLabels = new Set(
      [selectedCategory?.label, selectedCategory?.name, categoryValue]
        .filter(Boolean)
        .map((value) => normalizeOptionText(value)),
    );

    const subCategoryOptions = masterOptions["raw-material-sub-category"] ?? [];

    return subCategoryOptions.filter((option: any) => {
      const optionFields = option.fields ?? {};
      const optionParentIds = [
        option.parent_id,
        option.parentValueId,
        optionFields.raw_material_category_id,
        optionFields.Raw_Material_Category1,
      ].filter(Boolean).map((value) => String(value));
      const parentLabel = String(
        option.parent_label
          ?? option.parentName
          ?? option.parent
          ?? optionFields.raw_material_category
          ?? optionFields.Raw_Material_Category1
          ?? "",
      ).trim();
      const categoryLabel = String(option.category ?? option.categoryName ?? "").trim();

      return optionParentIds.some((parentId) => selectedCategoryIds.has(parentId))
        || selectedCategoryLabels.has(normalizeOptionText(parentLabel))
        || selectedCategoryLabels.has(normalizeOptionText(categoryLabel))
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
      [
        selectedSubCategory?.id,
        selectedSubCategory?.value_id,
        selectedSubCategory?.parent_id,
        selectedSubCategory?.parentValueId,
        selectedSubCategory?.fields?.Raw_Material_Category1,
      ]
        .filter(Boolean)
        .map((value) => String(value)),
    );
    const selectedSubCategoryLabels = new Set(
      [selectedSubCategory?.label, selectedSubCategory?.name, subCategoryValue]
        .filter(Boolean)
        .map((value) => normalizeOptionText(value)),
    );

    return rawMaterialOptions.filter((option: any) => {
      const optionFields = option.fields ?? {};
      const optionParentIds = [
        option.parent_id,
        option.parentValueId,
        option.sub_category_id,
        option.subCategoryId,
        optionFields.Subcategory,
        optionFields.raw_material_sub_category_id,
      ].filter(Boolean).map((value) => String(value));
      const optionCategory = String(option.category ?? option.categoryName ?? optionFields.Category ?? "").trim();
      const optionSubCategory = String(
        option.subCategory
          ?? option.sub_category
          ?? optionFields.Subcategory
          ?? optionFields.raw_material_sub_category
          ?? "",
      ).trim();

      return optionParentIds.some((parentId) => selectedSubCategoryIds.has(parentId))
        || selectedSubCategoryLabels.has(normalizeOptionText(optionSubCategory))
        || normalizeOptionText(optionCategory) === normalizeOptionText(categoryValue);
    });
  };

  const getRawMaterialStockUom = (rawMaterialName: string) => {
    const option = (masterOptions?.["raw-material"] ?? []).find((item: any) =>
      String(item.label ?? item.name ?? "").trim() === rawMaterialName.trim(),
    );
    return String(option?.fields?.Stock_Uom1 ?? option?.fields?.stock_uom_id ?? "").trim();
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Bill of Materials</h3>
          <p className="mt-1 text-[11px] text-slate-500">Category tabs filter the view while keeping every BOM row in the same table data.</p>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox
            label="Advanced"
              checked={showAdvancedFields}
              onChange={(event) => setShowAdvancedFields(event.target.checked)}
            className="h-4 w-4"
          />
          <Button
            size="sm"
            type="button"
            onClick={addBomRow}
            disabled={isAllCategoryView}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add Row
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        {bomCategories.map((category) => (
          <Button
            variant={selectedBomCategory === category ? "primary" : "secondary"}
            size="sm"
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
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200 bg-slate-50/40 shadow-inner">
        <fieldset disabled={isAllCategoryView} className="min-w-0 border-0 p-0">
          <table className="min-w-[1200px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[210px]" />
            <col className="w-[220px]" />
            <col className="w-[130px]" />
            <col className="w-[150px]" />
            {showAdvancedFields && <col className="w-[150px]" />}
            {showAdvancedFields && <col className="w-[150px]" />}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material-sub-category")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </Button>
                  )}
                </div>
              </th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Stock UOM</th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">
                <div className="flex items-center justify-between gap-2">
                  <span>Raw Material Name</span>
                  {onOpenCreateMaster && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </Button>
                  )}
                </div>
              </th>
              <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">
                <div className="flex items-center justify-between gap-2">
                  <span>Size</span>
                  {onOpenCreateMaster && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onOpenCreateMaster("size")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </Button>
                  )}
                </div>
              </th>
              {showAdvancedFields && <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Buyer Cons.</th>}
              {showAdvancedFields && <th className="h-20 whitespace-normal p-3 align-top font-semibold leading-4">Buyer Price</th>}
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
            {visibleBomRows.map(({ row, index }: { row: BomRow; index: number }) => (
              <tr key={`${index}-${row.rawMaterialName || "row"}`} className="bg-white">
                <td className="p-2 align-top">
                  {renderMasterSelect ? (() => {
                    const filteredSubCategories = getFilteredSubCategoryOptions(String(row.category ?? ""));
                    const safeOptions = filteredSubCategories.filter((option: any) => option.label || option.name);
                    const value = String(row.subCategory ?? "");

                    return (
                      <Select
                        aria-label="Sub category"
                        value={value}
                        onChange={(event) => updateBomRow(index, "subCategory", event.target.value)}
                        options={[{ value: "", label: "Select sub category" }, ...safeOptions.map((option: any) => ({ value: option.label ?? option.name ?? "", label: option.label ?? option.name ?? "" }))]}
                        className="rounded p-1 text-xs"
                      />
                    );
                  })() : (
                    <Input
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
                      <Select
                        aria-label="Raw material"
                        value={value}
                        onChange={(event) => {
                          const rawMaterialName = event.target.value;
                          updateBomRow(index, "rawMaterialName", rawMaterialName);
                          updateBomRow(index, "stockUom", getRawMaterialStockUom(rawMaterialName));
                        }}
                        options={[{ value: "", label: row.subCategory ? "Select raw material" : "Select sub category first" }, ...safeOptions.map((option: any) => ({ value: option.label ?? option.name ?? "", label: option.label ?? option.name ?? "" }))]}
                        className="rounded p-1 text-xs"
                      />
                    );
                  })() : (
                    <Input
                      value={row.rawMaterialName || ""}
                      onChange={(e) => updateBomRow(index, "rawMaterialName", e.target.value)}
                      placeholder="Name"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="p-2 align-top">
                  <Input
                    value={String(row.stockUom ?? getRawMaterialStockUom(String(row.rawMaterialName ?? "")))}
                    disabled
                    placeholder="Auto-filled"
                    className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-600"
                  />
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
                    <Input
                      value={row.size || ""}
                      onChange={(e) => updateBomRow(index, "size", e.target.value)}
                      placeholder="Size"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                {showAdvancedFields && <td className="p-2 align-top">
                  <Input
                    type="number"
                    value={row.buyerConsumption || ""}
                    onChange={(e) => updateBomRow(index, "buyerConsumption", e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>}
                {showAdvancedFields && <td className="p-2 align-top">
                  <Input
                    type="number"
                    value={row.buyerPrice || ""}
                    onChange={(e) => updateBomRow(index, "buyerPrice", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>}
                <td className="p-2 align-top">
                  <Input
                    type="number"
                    value={row.internalConsumption || ""}
                    onChange={(e) => updateBomRow(index, "internalConsumption", e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <Input
                    type="number"
                    value={row.internalPrice || ""}
                    onChange={(e) => updateBomRow(index, "internalPrice", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <Input
                    type="number"
                    value={row.requiredQty || ""}
                    readOnly
                    placeholder="0"
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <Input
                    type="number"
                    value={row.itemWiseExcessPercentage || ""}
                    onChange={(e) => updateBomRow(index, "itemWiseExcessPercentage", e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2 align-top">
                  <Input
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
                  <Button
                    variant="danger"
                    size="sm"
                    type="button"
                    onClick={() => removeBomRow(index)}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </fieldset>
      </div>
    </div>
  );
}