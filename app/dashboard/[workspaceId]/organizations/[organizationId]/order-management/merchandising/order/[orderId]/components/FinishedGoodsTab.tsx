"use client";

import React, { useEffect, useRef } from "react";
import { calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";

type FinishedGoodsRow = {
  id?: string;
  buyerSize?: string | null;
  size?: string | null;
  beforeExcessQty?: number | string | null;
  excess?: number | string | null;
  excessQty?: number | string | null;
  totalQty?: number | string | null;
  buyerPoPrice?: number | string | null;
  exchangePrice?: number | string | null;
  priceInInr?: number | string | null;
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
  const rows = form?.rows ?? [];
  const calculatedFinishedGoods = calculateFinishedGoodsRows(rows);
  const previousSizeGroup = useRef<string>("");

  useEffect(() => {
    const sizeGroup = String(form?.sizeGroup ?? "");
    if (!sizeGroup) {
      previousSizeGroup.current = "";
      setForm((current: any) => Array.isArray(current.rows) && current.rows.length > 0 ? { ...current, rows: [] } : current);
      return;
    }

    const selectedGroup = (masterOptions["size-group"] ?? []).find((group: any) => group.label === sizeGroup || group.id === sizeGroup || group.value_id === sizeGroup);
    const mappedSizes = Array.isArray(selectedGroup?.sizes) ? selectedGroup.sizes : [];

    setForm((current: any) => {
      const currentRows = Array.isArray(current.rows) ? current.rows : [];
      const existingMap = new Map(currentRows.map((row: any) => [String(row.size ?? "").trim(), row]));

      const nextRows = mappedSizes.map((size: any) => {
        const sizeLabel = String(size.label ?? size.name ?? size ?? "").trim();
        const existingRow = sizeLabel ? existingMap.get(sizeLabel) : null;
        return {
          ...defaultSizeRow(),
          ...(existingRow ?? {}),
          size: sizeLabel,
        };
      });

      if (nextRows.length === currentRows.length && currentRows.every((row: any, index: number) => String(row.size ?? "").trim() === String(nextRows[index]?.size ?? "").trim())) {
        return current;
      }

      return {
        ...current,
        rows: nextRows,
      };
    });

    previousSizeGroup.current = sizeGroup;
  }, [form?.sizeGroup, masterOptions, setForm]);

  const updateSizeRow = (index: number, field: keyof FinishedGoodsRow, value: string) => {
    setForm((current: any) => {
      const updatedRows = [...(current.rows || [])];
      updatedRows[index] = { ...updatedRows[index], [field]: value };
      const calculated = calculateFinishedGoodsRows(updatedRows);
      return { ...current, rows: calculated.rows, orderQty: calculated.orderQty };
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
    const canCreate = onOpenCreateMaster && masterKey !== "size";

    return (
      <label className="flex flex-col gap-1.5 w-full">
        {label ? (
          <span className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>{label}</span>
            {canCreate && (
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
          canCreate && (
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
        <div>
          <h3 className="text-sm font-bold text-slate-900">Finished Goods Size Wise</h3>
          <p className="text-xs text-slate-500">Calculated Order Qty: {calculatedFinishedGoods.orderQty}</p>
        </div>
        <span className="text-xs text-slate-500">Sizes come from Size Group</span>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {calculatedFinishedGoods.rows.map((row: FinishedGoodsRow, index: number) => (
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
                  {renderMasterSelect("", row.size ?? "", (val) => updateSizeRow(index, "size", val), "size", "Select size")}
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
                      readOnly
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <input
                      type="number"
                      value={row.totalQty || ""}
                      readOnly
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800"
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}