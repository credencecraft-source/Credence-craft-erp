"use client";

import React from "react";

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

export default function FinishedGoodsTab({
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
  onOpenCreateMaster?: (masterKey: string) => void;
}) {
  const rows = form?.rows?.length > 0 ? form.rows : [defaultSizeRow()];

  const addSizeRow = () => {
    setForm((current: any) => ({
      ...current,
      rows: [...(current.rows || []), defaultSizeRow()],
    }));
  };

  const removeSizeRow = (index: number) => {
    setForm((current: any) => ({
      ...current,
      rows: (current.rows || []).filter((_: any, i: number) => i !== index),
    }));
  };

  const updateSizeRow = (index: number, field: keyof FinishedGoodsRow, value: string) => {
    setForm((current: any) => {
      const updatedRows = [...(current.rows || [])];
      updatedRows[index] = { ...updatedRows[index], [field]: value };
      return { ...current, rows: updatedRows };
    });
  };

  const renderMasterSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string
  ) => {
    let options = masterOptions[masterKey] ?? [];

    if (value && !options.some((opt: any) => opt.label === value)) {
      options = [{ id: "current-legacy-fg", label: value, code: null, is_active: true }, ...options];
    }

    return (
      <label className="flex flex-col gap-1.5 w-full">
        {label ? (
          <span className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>{label}</span>
            {onOpenCreateMaster && (
              <button
                type="button"
                onClick={() => onOpenCreateMaster(masterKey)}
                className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
              >
                + New
              </button>
            )}
          </span>
        ) : (
          onOpenCreateMaster && (
            <div className="flex justify-end pb-0.5">
              <button
                type="button"
                onClick={() => onOpenCreateMaster(masterKey)}
                className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
              >
                + New
              </button>
            </div>
          )
        )}
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
        >
          <option value="">{placeholder}</option>
          {options.map((option: any) => (
            <option key={option.id} value={option.label}>
              {option.is_active ? option.label : `${option.label} (Not approved)`}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
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
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-2 min-w-[130px]">Buyer Size</th>
              <th className="p-2 min-w-[140px]">Size</th>
              <th className="p-2 min-w-[110px]">Before Excess Qty</th>
              <th className="p-2 min-w-[90px]">Excess %</th>
              <th className="p-2 min-w-[100px]">Excess Qty</th>
              <th className="p-2 min-w-[100px]">Total Qty</th>
              <th className="p-2 min-w-[110px]">Buyer Po Price</th>
              <th className="p-2 min-w-[110px]">Exchange Price</th>
              <th className="p-2 min-w-[110px]">Price In INR</th>
              <th className="p-2 min-w-[80px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {rows.map((row: FinishedGoodsRow, index: number) => (
              <tr key={`${index}-${row.size || "row"}`}>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="text"
                      value={row.buyerSize || ""}
                      onChange={(event) => updateSizeRow(index, "buyerSize", event.target.value)}
                      placeholder="Buyer Size"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  {renderMasterSelect("", row.size, (val) => updateSizeRow(index, "size", val), "size", "Select size")}
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.beforeExcessQty || ""}
                      onChange={(event) => updateSizeRow(index, "beforeExcessQty", event.target.value)}
                      placeholder="0"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.excess || ""}
                      onChange={(event) => updateSizeRow(index, "excess", event.target.value)}
                      placeholder="0"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.excessQty || ""}
                      onChange={(event) => updateSizeRow(index, "excessQty", event.target.value)}
                      placeholder="0"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.totalQty || ""}
                      onChange={(event) => updateSizeRow(index, "totalQty", event.target.value)}
                      placeholder="0"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.buyerPoPrice || ""}
                      onChange={(event) => updateSizeRow(index, "buyerPoPrice", event.target.value)}
                      placeholder="0.00"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.exchangePrice || ""}
                      onChange={(event) => updateSizeRow(index, "exchangePrice", event.target.value)}
                      placeholder="0.00"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.priceInInr || ""}
                      onChange={(event) => updateSizeRow(index, "priceInInr", event.target.value)}
                      placeholder="0.00"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-6">
                    <button
                      type="button"
                      onClick={() => removeSizeRow(index)}
                      className="text-red-600 hover:text-red-700 font-medium text-xs text-left"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}