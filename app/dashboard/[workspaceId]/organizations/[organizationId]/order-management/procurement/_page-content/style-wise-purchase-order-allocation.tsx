"use client";

import { ArrowLeft, Check, ChevronRight, Loader2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { formatNumber, text } from "./style-wise-purchase-order-format";
import type { BomRow, VendorOption, RawMaterialStockOption, MaterialGroup, MaterialCategory } from "./style-wise-purchase-order-types";
export function MaterialCategoryCard({
  category,
  onClick,
}: {
  category: MaterialCategory;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-700">
            Material category
          </p>
          <h3 className="mt-1 truncate text-sm font-bold text-slate-950">
            {category.label}
          </h3>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-600" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
        <div>
          <p className="text-[9px] font-bold uppercase text-slate-500">
            Materials
          </p>
          <p className="text-sm font-bold text-slate-950">
            {category.groupCount}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-slate-500">Lines</p>
          <p className="text-sm font-bold text-slate-950">
            {category.lineCount}
          </p>
        </div>
      </div>
    </Button>
  );
}
export function MaterialGroupCard({
  group,
  onClick,
}: {
  group: MaterialGroup;
  onClick: () => void;
}) {
  const orderCount = new Set(group.rows.map((row) => row.orderNo)).size;
  return (
    <Button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            {group.entityName} - {group.category}
          </p>
          <h3 className="mt-1 truncate text-base font-bold text-slate-950">
            {group.rawMaterialName}
          </h3>
          <p className="mt-1 truncate text-xs text-slate-500">
            {group.subCategory}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-700" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Stock UOM
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {text(group.stockUom)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Grouped Qty
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">
            {formatNumber(group.groupedQty)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Related Orders
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">{orderCount}</p>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-slate-500">
        {group.rows.length} BOM line{group.rows.length === 1 ? "" : "s"} · Click
        to view details
      </p>
    </Button>
  );
}

export function MaterialDetail({
  group,
  selectedIds,
  onBack,
  onToggleRow,
  onToggleAll,
}: {
  group: MaterialGroup;
  selectedIds: Set<string>;
  onBack: () => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected =
    group.rows.length > 0 && group.rows.every((row) => selectedIds.has(row.id));
  return (
    <section className="erp-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={onBack}
            aria-label="Back to raw-material groups"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
              Selected raw material
            </p>
            <h3 className="mt-1 text-sm font-bold text-slate-950">
              {group.rawMaterialName} · {group.subCategory}
            </h3>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Selected records
          </p>
          <p className="text-lg font-bold text-emerald-700">
            {selectedIds.size}
          </p>
        </div>
      </div>
      <div className="border-b border-slate-200 px-4 py-2 text-[10px] text-slate-500">
        Select the BOM order records you want to include, then click Allocate
        Vendor above.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-[10px]">
          <thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2.5 py-2">
                <Checkbox
                  type="checkbox"
                  aria-label="Select all related BOM records"
                  checked={allSelected}
                  onChange={onToggleAll}
                />
              </th>
              <th className="px-2.5 py-2">Order Name</th>
              <th className="px-2.5 py-2">Style Name</th>
              <th className="px-2.5 py-2">Brand</th>
              <th className="px-2.5 py-2">Category</th>
              <th className="px-2.5 py-2">Subcategory</th>
              <th className="px-2.5 py-2">Item</th>
              <th className="px-2.5 py-2">Internal Consumption</th>
              <th className="px-2.5 py-2 text-right">Required Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.rows.map((row) => (
              <tr
                key={row.id}
                className={
                  selectedIds.has(row.id)
                    ? "bg-emerald-50/60"
                    : "hover:bg-emerald-50/40"
                }
              >
                <td className="px-2.5 py-2">
                  <Checkbox
                    type="checkbox"
                    aria-label={`Select ${text(row.orderNo)} BOM record`}
                    checked={selectedIds.has(row.id)}
                    onChange={() => onToggleRow(row.id)}
                  />
                </td>
                <td className="px-2.5 py-2 font-semibold text-slate-800">
                  {text(row.orderNo)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.styleName)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.brand)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.category)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.subCategory)}
                </td>
                <td className="px-2.5 py-2 font-semibold text-slate-900">
                  {text(row.itemName)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {formatNumber(row.internalConsumption)}
                </td>
                <td className="px-2.5 py-2 text-right font-bold text-slate-900">
                  {formatNumber(row.requiredQty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StageButton({
  number,
  label,
  active,
  disabled,
  onClick,
  onMouseEnter,
  onFocus,
  icon: Icon,
}: {
  number: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  icon: typeof Check;
}) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-emerald-300"}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}
      >
        {number}
      </span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="truncate text-[10px] font-semibold text-slate-700">
        {label}
      </span>
    </Button>
  );
}

export function GroupedPurchaseOrderForm({
  rows,
  vendors,
  organizationId,
  onClose,
  onCreated,
  onError,
}: {
  rows: BomRow[];
  vendors: VendorOption[];
  organizationId: string;
  onClose: () => void;
  onCreated: (source: "stock" | "vendor") => void;
  onError: (message: string) => void;
}) {
  const routeParams = useParams<{
    workspaceId: string;
    organizationId: string;
  }>();
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [takingFromStock, setTakingFromStock] = useState(false);
  const [stockRows, setStockRows] = useState<RawMaterialStockOption[]>([]);
  const [stockIds, setStockIds] = useState<Record<string, string>>({});
  const [stockLoading, setStockLoading] = useState(true);
  const [lines, setLines] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.id, String(row.remainingQty ?? row.requiredQty ?? "")]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const currentStoreVendor = vendors.find((vendor) => vendor.isCurrentStore);
  const stockOptionsFor = (row: BomRow) => stockRows.filter((stock) =>
    stock.entity_id === row.entityId
    && stock.raw_material.trim().toLowerCase() === String(row.itemName ?? "").trim().toLowerCase()
    && Number(stock.quantity_on_hand) > Number(stock.quantity_reserved),
  );
  const availableQty = (stock: RawMaterialStockOption) => Number(stock.quantity_on_hand) - Number(stock.quantity_reserved);
  const currentStockOptions = rows[0]
    ? stockRows.filter((stock) =>
        stock.entity_id === rows[0].entityId
        && stock.raw_material.trim().toLowerCase() === String(rows[0].itemName ?? "").trim().toLowerCase()
        && availableQty(stock) > 0,
      )
    : [];
  const currentStockQty = currentStockOptions.reduce(
    (total, stock) => total + availableQty(stock),
    0,
  );
  const selectedStockFor = (row: BomRow) => {
    const options = stockOptionsFor(row);
    return options.find((stock) => stock.id === stockIds[row.id]) ?? (options.length === 1 ? options[0] : null);
  };

  useEffect(() => {
    let mounted = true;
    fetch(`/api/inventory/stock?organizationId=${encodeURIComponent(organizationId)}&type=RM`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load available stock.");
        if (mounted) setStockRows(Array.isArray(data.stock) ? data.stock : []);
      })
      .catch((error) => onError(error instanceof Error ? error.message : "Unable to load available stock."))
      .finally(() => { if (mounted) setStockLoading(false); });
    return () => { mounted = false; };
  }, [organizationId, onError]);

  const selectStockAllocation = (checked: boolean) => {
    setTakingFromStock(checked);
    if (!checked) {
      setVendorId("");
      setLines(Object.fromEntries(rows.map((row) => [row.id, String(row.remainingQty ?? row.requiredQty ?? "")])));
      return;
    }
    if (currentStoreVendor) setVendorId(currentStoreVendor.id);
    setLines(Object.fromEntries(rows.map((row) => {
      const options = stockOptionsFor(row);
      const selectedStock = options.find((stock) => stock.id === stockIds[row.id]) ?? (options.length === 1 ? options[0] : null);
      return [row.id, selectedStock ? String(Math.min(Number(row.remainingQty ?? row.requiredQty ?? 0), availableQty(selectedStock))) : "0"];
    })));
  };

  const updateQty = (row: BomRow, value: string) =>
    setLines((current) => ({
      ...current,
      [row.id]: value === "" ? "" : String(Math.min(
        Number(value),
        Number(row.remainingQty ?? row.requiredQty ?? 0),
        takingFromStock ? (selectedStockFor(row) ? availableQty(selectedStockFor(row)!) : 0) : Number.POSITIVE_INFINITY,
      )),
    }));
  const submit = async () => {
    setSubmitting(true);
    try {
      if (takingFromStock) {
        const bookingLines = rows.filter((row) => Number(lines[row.id]) > 0).map((row) => ({
          bomItemId: row.id,
          takeFromStockId: stockIds[row.id] || stockOptionsFor(row)[0]?.id || "",
          bookedQuantity: lines[row.id],
        }));
        if (!currentStoreVendor) throw new Error("Mark one Vendor Master record as the current store before booking stock.");
        if (bookingLines.some((line) => !line.takeFromStockId)) throw new Error("Select an available stock source for every booked line.");
        if (bookingLines.length === 0) throw new Error("Enter a positive quantity to book from stock.");
        const response = await fetch(`/api/inventory/booked-stock?organizationId=${encodeURIComponent(organizationId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, currentStoreVendorId: currentStoreVendor.id, lines: bookingLines }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to book stock.");
        onCreated("stock");
        return;
      }
      const response = await fetch(
        `/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            vendorId,
            lines: rows.filter((row) => Number(lines[row.id]) > 0).map((row) => ({
              bomItemId: row.id,
              groupedQty: lines[row.id],
            })),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to submit grouped PO.");
      onCreated("vendor");
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to submit grouped PO.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const invalidStockLines = rows.some((row) => Number(lines[row.id] ?? 0) > 0 && (
    !selectedStockFor(row)
    || Number(lines[row.id]) > Number(row.remainingQty ?? row.requiredQty ?? 0)
    || Number(lines[row.id]) > availableQty(selectedStockFor(row)!)
  ));
  const noStockQuantity = rows.every((row) => Number(lines[row.id] ?? 0) <= 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grouped-po-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-[1250px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
              {takingFromStock ? "Take from Stock" : "New grouped PO"}
            </p>
            <h2
              id="grouped-po-title"
              className="mt-1 text-lg font-bold text-slate-950"
            >
              {takingFromStock ? "Book selected inventory" : "Allocate selected raw materials"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {takingFromStock ? "Booked quantity is reserved in General Inventory and reduces the remaining BOM requirement." : "This grouped PO will be submitted to Stage 2 price approval."}
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            <div className="min-w-[118px] rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-right">
              <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-800">
                Available stock
              </p>
              <p className="text-sm font-bold tabular-nums text-emerald-950">
                {stockLoading
                  ? "Loading..."
                  : `${formatNumber(currentStockQty)} ${text(rows[0]?.stockUom, "units")}`}
              </p>
            </div>
            {!stockLoading && currentStockQty > 0 && (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <Checkbox
                  checked={takingFromStock}
                  disabled={!currentStoreVendor}
                  onChange={(event) => selectStockAllocation(event.target.checked)}
                  label="Take from Stock"
                  className="h-3.5 w-3.5"
                />
                {takingFromStock && currentStoreVendor ? (
                  <p className="ml-6 mt-1 text-[10px] font-semibold text-emerald-800">
                    Current store: {currentStoreVendor.label}
                  </p>
                ) : !currentStoreVendor ? (
                  <p className="ml-6 mt-1 max-w-52 text-[10px] text-slate-500">
                    Mark an active vendor as the current store to enable stock booking.
                  </p>
                ) : null}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close grouped PO form"
              className="min-h-7 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <label className="block max-w-sm text-xs font-bold text-slate-700">
            Vendor lookup
            <Select
              value={vendorId}
              disabled={takingFromStock}
              onChange={(event) => {
                setVendorId(event.target.value);
                setLines(Object.fromEntries(rows.map((row) => [row.id, String(row.remainingQty ?? row.requiredQty ?? "")])));
              }}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500"
            >
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="mt-2 flex max-w-sm justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                router.push(
                  `/dashboard/${routeParams.workspaceId}/organizations/${routeParams.organizationId}/admin/master-data/vendor`,
                )
              }
              className="shrink-0 rounded-md px-3 py-2 text-xs font-semibold"
            >
              Open Vendor Master
            </Button>
          </div>
        </div>
        <div className="min-h-0 overflow-auto p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-900">
              {takingFromStock ? "Stock booking subform" : "Grouped PO subform"}
            </p>
            <span className="text-[10px] text-slate-500">
              {rows.length} selected lines
            </span>
          </div>
          <table className="w-full min-w-[1050px] text-left text-[10px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2.5 py-2">Order Name</th>
                <th className="px-2.5 py-2">Style Name</th>
                <th className="px-2.5 py-2">Brand</th>
                <th className="px-2.5 py-2">Category</th>
                <th className="px-2.5 py-2">Subcategory</th>
                <th className="px-2.5 py-2">Item</th>
                {takingFromStock && <th className="px-2.5 py-2">Stock Source</th>}
                <th className="px-2.5 py-2">Internal Consumption</th>
                <th className="px-2.5 py-2 text-right">Remaining Qty</th>
                <th className="px-2.5 py-2 text-right">{takingFromStock ? "Booked Qty" : "Grouped Qty"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-2.5 py-2 font-semibold text-slate-800">
                    {text(row.orderNo)}
                  </td>
                  <td className="px-2.5 py-2">{text(row.styleName)}</td>
                  <td className="px-2.5 py-2">{text(row.brand)}</td>
                  <td className="px-2.5 py-2">{text(row.category)}</td>
                  <td className="px-2.5 py-2">{text(row.subCategory)}</td>
                  <td className="px-2.5 py-2 font-semibold text-slate-900">
                    {text(row.itemName)}
                  </td>
                  {takingFromStock && <td className="min-w-56 px-2.5 py-2">
                    {stockOptionsFor(row).length > 1 ? <Select
                      aria-label={`Select stock location for ${text(row.itemName)}`}
                      value={stockIds[row.id] ?? ""}
                      onChange={(event) => {
                        const stock = stockOptionsFor(row).find((item) => item.id === event.target.value);
                        setStockIds((current) => ({ ...current, [row.id]: event.target.value }));
                        if (stock) setLines((current) => ({ ...current, [row.id]: String(Math.min(Number(row.remainingQty ?? row.requiredQty ?? 0), availableQty(stock))) }));
                      }}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-emerald-500"
                    ><option value="">Select stock location</option>{stockOptionsFor(row).map((stock) => <option key={stock.id} value={stock.id}>{stock.location.location_name} · available {formatNumber(availableQty(stock))}</option>)}</Select>
                      : selectedStockFor(row) ? <span>{selectedStockFor(row)!.location.location_name} · {formatNumber(availableQty(selectedStockFor(row)!))} available</span>
                        : <span className="text-amber-700">No available stock</span>}
                  </td>}
                  <td className="px-2.5 py-2">
                    {formatNumber(row.internalConsumption)}
                  </td>
                  <td className="px-2.5 py-2 text-right font-bold">
                    {formatNumber(row.remainingQty ?? row.requiredQty)}
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <Input
                      aria-label={`${takingFromStock ? "Booked" : "Grouped"} quantity for ${text(row.orderNo)}`}
                      type="number"
                      min="0"
                      max={takingFromStock ? (selectedStockFor(row) ? Math.min(Number(row.remainingQty ?? row.requiredQty ?? 0), availableQty(selectedStockFor(row)!)) : 0) : row.remainingQty ?? row.requiredQty ?? undefined}
                      step="0.01"
                      value={lines[row.id] ?? ""}
                      onChange={(event) => updateQty(row, event.target.value)}
                      disabled={takingFromStock && !selectedStockFor(row)}
                      className="w-28 rounded border border-slate-300 px-2 py-1 text-right outline-none focus:border-emerald-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-xs font-semibold text-slate-600"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={submitting || (takingFromStock ? (!currentStoreVendor || stockLoading || invalidStockLines || noStockQuantity) : !vendorId)}
            onClick={submit}
            className="rounded-md px-4 py-2 text-xs font-bold"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{" "}
            {takingFromStock ? "Book Stock" : "Submit grouped PO"}
          </Button>
        </div>
      </div>
    </div>
  );
}
