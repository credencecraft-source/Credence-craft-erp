"use client";

import React, { useEffect, useRef } from "react";
import { calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";
import type { FinishedGoodsQuantityInput } from "@/lib/services/orders/order-quantity-calculations";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import type { OrderFormState } from "./order-form-types";

type FinishedGoodsRow = FinishedGoodsQuantityInput;

type MasterDataOption = {
  id?: string;
  label?: string;
  code?: string | null;
  value_id?: string;
  name?: string;
  is_active?: boolean;
  sizes?: unknown[];
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getSizeLabel = (size: unknown): string =>
  String(isRecord(size) ? size.label ?? size.name ?? size : size ?? "");

export default function FinishedGoodsTab({
  form,
  setForm,
  masterOptions = {},
  onOpenCreateMaster,
  isVariantMode = false,
}: {
  form: OrderFormState;
  setForm: React.Dispatch<React.SetStateAction<OrderFormState>>;
  masterOptions?: Record<string, MasterDataOption[]>;
  orderLookups?: Array<{ key: string; lookupModuleKey?: string; dependsOn?: string }>;
  onOpenCreateMaster?: (masterKey: string) => void;
  isVariantMode?: boolean;
}) {
  const rows = form?.rows ?? [];
  const calculatedFinishedGoods = calculateFinishedGoodsRows(rows);
  const previousSizeGroup = useRef<string>("");

  useEffect(() => {
    if (isVariantMode) return;

    const sizeGroup = String(form?.sizeGroup ?? "");
    if (!sizeGroup) {
      previousSizeGroup.current = "";
      setForm((current) => Array.isArray(current.rows) && current.rows.length > 0
        ? { ...current, rows: [], orderQty: 0 }
        : current.orderQty === 0 ? current : { ...current, orderQty: 0 });
      return;
    }

    const selectedGroup = (masterOptions["size-group"] ?? []).find((group) => group.label === sizeGroup || group.id === sizeGroup || group.value_id === sizeGroup);
    const mappedSizes = Array.isArray(selectedGroup?.sizes) ? selectedGroup.sizes : [];

    setForm((current) => {
      const currentRows = current.rows;
      const existingMap = new Map(currentRows.map((row) => [String(row.size ?? "").trim(), row]));

      const nextRows = mappedSizes.map((size) => {
        const sizeLabel = getSizeLabel(size).trim();
        const existingRow = sizeLabel ? existingMap.get(sizeLabel) : null;
        return {
          ...defaultSizeRow(),
          ...(existingRow ?? {}),
          size: sizeLabel,
        };
      });

      if (nextRows.length === currentRows.length && currentRows.every((row, index) => String(row.size ?? "").trim() === String(nextRows[index]?.size ?? "").trim())) {
        return current;
      }

      return {
        ...current,
        rows: nextRows,
        orderQty: calculateFinishedGoodsRows(nextRows).orderQty,
      };
    });

    previousSizeGroup.current = sizeGroup;
  }, [form?.sizeGroup, isVariantMode, masterOptions, setForm]);

  const updateSizeRow = (index: number, field: keyof FinishedGoodsRow, value: string) => {
    setForm((current) => {
      const updatedRows = [...current.rows];
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

    if (value && !options.some((opt) => opt.label === value)) {
      options = [{ id: "current-legacy-fg", label: value, code: null, is_active: true }, ...options];
    }
    const canCreate = onOpenCreateMaster && masterKey !== "size";

    return (
      <label className="flex flex-col gap-1.5 w-full">
        {label ? (
          <span className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>{label}</span>
            {canCreate && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => onOpenCreateMaster(masterKey)}
                className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
              >
                + New
              </Button>
            )}
          </span>
        ) : (
          canCreate && (
            <div className="flex justify-end pb-0.5">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => onOpenCreateMaster(masterKey)}
                className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
              >
                + New
              </Button>
            </div>
          )
        )}
        <Select
          aria-label={label || placeholder}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
          options={[{ value: "", label: placeholder }, ...options.map((option) => ({ value: option.label ?? "", label: option.is_active ? option.label ?? "" : `${option.label ?? ""} (Not approved)` }))]}
        />
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {calculatedFinishedGoods.rows.map((row, index) => (
              <tr key={`${index}-${row.size || "row"}`}>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <Input
                      aria-label="Buyer Size"
                      type="text"
                      value={row.buyerSize || ""}
                      onChange={(event) => updateSizeRow(index, "buyerSize", event.target.value)}
                      placeholder="Buyer Size"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none w-full"
                    />
                  </div>
                </td>
                <td className="p-2">
                  <div className="pt-5">
                    {renderMasterSelect("", row.size ?? "", (val) => updateSizeRow(index, "size", val), "size", "Select size")}
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-1.5 pt-5">
                    <Input
                      aria-label="Before Excess Quantity"
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
                    <Input
                      aria-label="Excess Percentage"
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
                    <Input
                      aria-label="Excess Quantity"
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
                    <Input
                      aria-label="Total Quantity"
                      type="number"
                      value={row.totalQty || ""}
                      readOnly
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800"
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