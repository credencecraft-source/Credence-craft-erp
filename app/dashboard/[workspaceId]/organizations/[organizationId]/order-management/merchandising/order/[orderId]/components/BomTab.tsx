"use client";

import React from "react";

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

export default function BomTab({
  form,
  setForm,
  renderMasterSelect,
  onOpenCreateMaster,
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
}) {
  const bomRows = form?.bomRows?.length > 0 ? form.bomRows : [defaultBomRow()];

  const addBomRow = () => {
    setForm((current: any) => ({
      ...current,
      bomRows: [...(current.bomRows || []), defaultBomRow()],
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
      updatedRows[index] = { ...updatedRows[index], [field]: value };
      return { ...current, bomRows: updatedRows };
    });
  };

  return (
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
                  {onOpenCreateMaster && (
                    <button
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material-type")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </button>
                  )}
                </div>
              </th>
              <th className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <span>Raw Material Category</span>
                  {onOpenCreateMaster && (
                    <button
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material-category")}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </button>
                  )}
                </div>
              </th>
              <th className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <span>Raw Material Sub Category</span>
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
              <th className="p-2">
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
              <th className="p-2">
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
              <th className="p-2">Consumption</th>
              <th className="p-2">Required Qty</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bomRows.map((row: BomRow, index: number) => (
              <tr key={`${index}-${row.rawMaterialName || "row"}`}>
                <td className="p-2">
                  {renderMasterSelect ? (
                    renderMasterSelect(
                      row.categoryType,
                      (val) => updateBomRow(index, "categoryType", val),
                      "raw-material-type",
                      "Select type"
                    )
                  ) : (
                    <input
                      value={row.categoryType || ""}
                      onChange={(e) => updateBomRow(index, "categoryType", e.target.value)}
                      placeholder="Type"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="p-2">
                  {renderMasterSelect ? (
                    renderMasterSelect(
                      row.category,
                      (val) => updateBomRow(index, "category", val),
                      "raw-material-category",
                      "Select category"
                    )
                  ) : (
                    <input
                      value={row.category || ""}
                      onChange={(e) => updateBomRow(index, "category", e.target.value)}
                      placeholder="Category"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="p-2">
                  {renderMasterSelect ? (
                    renderMasterSelect(
                      row.subCategory,
                      (val) => updateBomRow(index, "subCategory", val),
                      "raw-material-sub-category",
                      "Select sub category",
                      row.category
                    )
                  ) : (
                    <input
                      value={row.subCategory || ""}
                      onChange={(e) => updateBomRow(index, "subCategory", e.target.value)}
                      placeholder="Sub Category"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="p-2">
                  {renderMasterSelect ? (
                    renderMasterSelect(
                      row.rawMaterialName,
                      (val) => updateBomRow(index, "rawMaterialName", val),
                      "raw-material",
                      "Select raw material"
                    )
                  ) : (
                    <input
                      value={row.rawMaterialName || ""}
                      onChange={(e) => updateBomRow(index, "rawMaterialName", e.target.value)}
                      placeholder="Name"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  )}
                </td>
                <td className="p-2">
                  {renderMasterSelect ? (
                    renderMasterSelect(
                      row.size,
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
                <td className="p-2">
                  <input
                    type="number"
                    value={row.consumption || ""}
                    onChange={(e) => updateBomRow(index, "consumption", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={row.requiredQty || ""}
                    onChange={(e) => updateBomRow(index, "requiredQty", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => removeBomRow(index)}
                    className="text-red-600 hover:text-red-700 font-medium"
                  >
                    Remove
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