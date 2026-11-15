"use client";

import { useEffect, useState } from "react";
import Input from "@/components/ui/Input";
import { formatNumber, text, registrationStateCode } from "./style-wise-purchase-order-format";
import type { GstOption, UomConvertOption, GroupedPurchaseOrder } from "./style-wise-purchase-order-types";
import Select from "@/components/ui/Select";
import Checkbox from "@/components/ui/Checkbox";
import Button from "@/components/ui/Button";

export function DetailedPriceApprovalCard({
  order,
  gstOptions,
  organizationId,
  onUpdated,
  onError,
}: {
  order: GroupedPurchaseOrder;
  gstOptions: GstOption[];
  organizationId: string;
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [vendorPriceInr, setVendorPriceInr] = useState(
    String(order.vendorPriceInr ?? order.vendorPrice ?? ""),
  );
  const [gst, setGst] = useState(String(order.gst ?? ""));
  const [gstMasterId, setGstMasterId] = useState(
    () =>
      gstOptions.find(
        (option) =>
          Number(option.fields?.Gst ?? option.fields?.gst) ===
          Number(order.gst),
      )?.id ?? "",
  );
  const [uomConvertOptions, setUomConvertOptions] = useState<
    UomConvertOption[]
  >([]);
  const [buyingUom, setBuyingUom] = useState(order.buyingUom ?? "");
  const [convertValue, setConvertValue] = useState(
    String(order.convertValue ?? ""),
  );
  const [hsnCode, setHsnCode] = useState(order.hsnCode ?? "");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showTax, setShowTax] = useState(false);

  const selectedGstMasterId = gstMasterId || (
    order.gst === null || order.gst === undefined
      ? ""
      : gstOptions.find(
          (option) =>
            Number(option.fields?.Gst ?? option.fields?.gst) === Number(order.gst),
        )?.id ?? ""
  );

  useEffect(() => {
    const loadUomConversions = async () => {
      try {
        const [uomResponse, conversionResponse] = await Promise.all([
          fetch(
            `/api/organizations/${encodeURIComponent(organizationId)}/master-data/uom?includeInactive=false`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/organizations/${encodeURIComponent(organizationId)}/master-data/stock-uom-convert?includeInactive=false`,
            { cache: "no-store" },
          ),
        ]);
        const uomOptions = await uomResponse.json();
        const conversionOptions = await conversionResponse.json();
        if (!uomResponse.ok || !conversionResponse.ok)
          throw new Error("Unable to load UOM conversions.");
        const stockUom = String(
          order.stockUom ?? order.lines[0]?.stockUom ?? "",
        )
          .trim()
          .toLowerCase();
        const stockUomRecord = (
          Array.isArray(uomOptions) ? uomOptions : []
        ).find(
          (option: UomConvertOption) =>
            String(option.label ?? "")
              .trim()
              .toLowerCase() === stockUom,
        );
        const matchingConversions = (
          Array.isArray(conversionOptions) ? conversionOptions : []
        ).filter(
          (option: UomConvertOption) =>
            option.parent_id === stockUomRecord?.id ||
            option.parent_id === stockUomRecord?.value_id,
        );
        setUomConvertOptions(matchingConversions);
      } catch (loadError) {
        setActionError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load UOM conversions.",
        );
      }
    };
    void loadUomConversions();
  }, [organizationId, order.lines, order.stockUom]);

  const savePrice = async () => {
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            action: "update-header",
            vendorPriceInr,
            vendorPrice: vendorPriceInr,
            gst,
            gstMasterId: selectedGstMasterId,
            hsnCode,
            buyingUom,
            convertValue,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update grouped PO.");
      await onUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update grouped PO.";
      setActionError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  const headerTotalQty = Number(
    order.totalGroupedQty ??
      order.lines.reduce(
        (total, line) => total + Number(line.groupedQty ?? 0),
        0,
      ),
  );
  const buyingQty =
    Number(convertValue) > 0 ? headerTotalQty / Number(convertValue) : 0;
  const headerTotal = order.lines.reduce(
    (sum, line) =>
      sum +
      Number(line.groupedQty ?? 0) *
        Number(vendorPriceInr || line.vendorPrice || 0),
    0,
  );

  /*

  return <div className="erp-surface overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-xs font-bold text-slate-950">{order.groupedPoNo}</p><p className="text-[10px] text-slate-500">{order.vendor.name} · {order.lines.length} raw-material lines · {new Date(order.submittedAt).toLocaleDateString()}</p></div><span className="text-xs font-bold text-emerald-700">{formatNumber(order.totalGroupedQty ?? order.lines.reduce((total, line) => total + Number(line.groupedQty ?? 0), 0))} qty</span></div><div className="space-y-4 p-4"><div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Vendor" value={order.vendor.name} readOnly /><Field label="Raw material" value={text(order.rawMaterial)} readOnly /><Field label="Category / subcategory" value={`${text(order.category)} / ${text(order.subCategory)}`} readOnly /><Field label="No. of styles" value={String(order.noOfStyles ?? order.lines.length)} readOnly /><Field label="Vendor Price INR" value={vendorPriceInr} onChange={setVendorPriceInr} /></div>{actionError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}<div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-[10px]"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Grouping / Order</th><th className="px-2 py-2">Style</th><th className="px-2 py-2">Raw material</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Buying Qty</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2 text-right">GST</th><th className="px-2 py-2">HSN Code</th><th className="px-2 py-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{order.lines.map((line) => <tr key={line.id}><td className="px-2 py-2 font-semibold text-slate-800">{text(line.orderNo)}</td><td className="px-2 py-2">{text(line.styleName)}</td><td className="px-2 py-2 font-semibold text-slate-900">{text(line.itemName)}</td><td className="px-2 py-2 text-right">{formatNumber(line.groupedQty)}</td><td className="px-2 py-2 text-right">{formatNumber(Number(convertValue) > 0 ? Number(line.groupedQty ?? 0) / Number(convertValue) : 0)}</td><td className="px-2 py-2 text-right font-bold text-emerald-700">{formatNumber(Number(vendorPriceInr || line.vendorPrice || 0))}</td><td className="px-2 py-2 text-right">{text(line.gst)}</td><td className="px-2 py-2">{text(line.hsnCode)}</td><td className="px-2 py-2 text-right font-bold">{formatNumber(line.total ?? (Number(line.groupedQty ?? 0) * Number(vendorPriceInr || line.vendorPrice || 0)))}</td></tr>)}</tbody></table></div><div className="flex justify-end"><button type="button" disabled={saving} onClick={savePrice} className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{saving ? "Saving..." : "Save price"}</button></div></div></div>;
  const headerGst = [...new Set(order.lines.map((line) => text(line.gst, "-")))].join(", ");
  const headerHsn = [...new Set(order.lines.map((line) => text(line.hsnCode, "-")))].join(", ");
  const headerTotal = order.lines.reduce((sum, line) => sum + Number(line.total ?? (Number(line.groupedQty ?? 0) * Number(vendorPriceInr || line.vendorPrice || 0))), 0);

  return <div className="erp-surface overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-xs font-bold text-slate-950">{order.groupedPoNo}</p><p className="text-[10px] text-slate-500">{order.vendor.name} · {order.lines.length} raw-material lines · {new Date(order.submittedAt).toLocaleDateString()}</p></div><span className="text-xs font-bold text-emerald-700">{formatNumber(order.totalGroupedQty ?? order.lines.reduce((total, line) => total + Number(line.groupedQty ?? 0), 0))} qty</span></div><div className="space-y-4 p-4"><div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Vendor" value={order.vendor.name} readOnly /><Field label="Raw material" value={text(order.rawMaterial)} readOnly /><Field label="Category / subcategory" value={`${text(order.category)} / ${text(order.subCategory)}`} readOnly /><Field label="No. of styles" value={String(order.noOfStyles ?? order.lines.length)} readOnly /><Field label="Vendor Price INR" value={vendorPriceInr} onChange={setVendorPriceInr} /><ReadOnlyValue label="GST" value={headerGst} /><ReadOnlyValue label="HSN Code" value={headerHsn} /><ReadOnlyValue label="Total" value={formatNumber(headerTotal)} /></div>{actionError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}

  */
  const selectedGst = gstOptions.find((option) => option.id === selectedGstMasterId);
  const gstRate = Number(
    selectedGst?.fields?.Gst ?? selectedGst?.fields?.gst ?? gst ?? 0,
  );
  const cgstRate = Number(
    selectedGst?.fields?.Cgst_Rate ??
      selectedGst?.fields?.cgst_rate ??
      gstRate / 2,
  );
  const sgstRate = Number(
    selectedGst?.fields?.Sgst_Rate ??
      selectedGst?.fields?.sgst_rate ??
      gstRate / 2,
  );
  const igstRate = Number(
    selectedGst?.fields?.Igst_Rate ?? selectedGst?.fields?.igst_rate ?? gstRate,
  );
  const sameState = Boolean(
    registrationStateCode(order.organizationState, order.organizationGstin) &&
    registrationStateCode(order.organizationState, order.organizationGstin) ===
      registrationStateCode(order.vendor.registeredState, order.vendor.gstin),
  );
  const applicableCgstRate = sameState ? cgstRate : 0;
  const applicableSgstRate = sameState ? sgstRate : 0;
  const applicableIgstRate = sameState ? 0 : igstRate;
  const cgstAmount = (headerTotal * applicableCgstRate) / 100;
  const sgstAmount = (headerTotal * applicableSgstRate) / 100;
  const igstAmount = (headerTotal * applicableIgstRate) / 100;
  const totalTax = cgstAmount + sgstAmount + igstAmount;
  return (
    <div className="erp-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Entity" value={order.entityName || "Missing Entity"} readOnly />
        <Field label="Vendor" value={order.vendor.name} readOnly />
        <Field label="Raw material" value={text(order.rawMaterial)} readOnly />
        <Field
          label="Vendor Price INR"
          value={vendorPriceInr}
          onChange={setVendorPriceInr}
        />
        <Field
          label="Stock UOM"
          value={text(order.stockUom ?? order.lines[0]?.stockUom)}
          disabled
        />
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Buying UOM lookup
          </span>
          <Select
            value={buyingUom}
            onChange={(event) => {
              const option = uomConvertOptions.find(
                (item) => item.label === event.target.value,
              );
              setBuyingUom(event.target.value);
              setConvertValue(
                String(
                  option?.fields?.How_Many ?? option?.fields?.how_many ?? "",
                ),
              );
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">Select buying UOM</option>
            {uomConvertOptions.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <Field label="Convert Value" value={convertValue} disabled />
        <Field label="Buying Qty" value={formatNumber(buyingQty)} disabled />
        <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700">
          <Checkbox
            type="checkbox"
            checked={showTax}
            onChange={(event) => setShowTax(event.target.checked)}
          />{" "}
          Show tax
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
            GST lookup
          </span>
          <Select
            value={selectedGstMasterId}
            onChange={(event) => {
              const option = gstOptions.find(
                (item) => item.id === event.target.value,
              );
              setGstMasterId(event.target.value);
              setGst(String(option?.fields?.Gst ?? option?.fields?.gst ?? ""));
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">Select GST</option>
            {gstOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} (
                {String(option.fields?.Gst ?? option.fields?.gst ?? "-")}%)
              </option>
            ))}
          </Select>
        </label>
        {showTax && (
          <>
            <ReadOnlyValue
              label="CGST"
              value={`${applicableCgstRate}% (${formatNumber(cgstAmount)})`}
            />
            <ReadOnlyValue
              label="SGST"
              value={`${applicableSgstRate}% (${formatNumber(sgstAmount)})`}
            />
            <ReadOnlyValue
              label="IGST"
              value={`${applicableIgstRate}% (${formatNumber(igstAmount)})`}
            />
            <ReadOnlyValue label="Total tax" value={formatNumber(totalTax)} />
          </>
        )}
        <Field label="HSN Code" value={hsnCode} onChange={setHsnCode} />
        <ReadOnlyValue label="Total Qty" value={formatNumber(headerTotalQty)} />
        <ReadOnlyValue label="Total" value={formatNumber(headerTotal)} />
      </div>
      {actionError && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {actionError}
        </div>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-[10px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Grouping / Order</th>
              <th className="px-2 py-2">Style</th>
              <th className="px-2 py-2">Raw material</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Buying Qty</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">GST</th>
              <th className="px-2 py-2">HSN Code</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-2 py-2 font-semibold text-slate-800">
                  {text(line.orderNo)}
                </td>
                <td className="px-2 py-2">{text(line.styleName)}</td>
                <td className="px-2 py-2 font-semibold text-slate-900">
                  {text(line.itemName)}
                </td>
                <td className="px-2 py-2 text-right">
                  {formatNumber(line.groupedQty)}
                </td>
                <td className="px-2 py-2 text-right">
                  {formatNumber(
                    Number(convertValue) > 0
                      ? Number(line.groupedQty ?? 0) / Number(convertValue)
                      : 0,
                  )}
                </td>
                <td className="px-2 py-2 text-right font-bold text-emerald-700">
                  {formatNumber(
                    Number(vendorPriceInr || line.vendorPrice || 0),
                  )}
                </td>
                <td className="px-2 py-2 text-right">{text(gst)}</td>
                <td className="px-2 py-2">{text(hsnCode)}</td>
                <td className="px-2 py-2 text-right font-bold">
                  {formatNumber(
                    Number(line.groupedQty ?? 0) *
                      Number(vendorPriceInr || line.vendorPrice || 0),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          disabled={saving}
          onClick={savePrice}
          className="rounded-md px-4 py-2 text-xs font-bold"
        >
          {saving ? "Saving..." : "Save price"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <Input
      label={label}
      readOnly={readOnly}
      disabled={disabled}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      className="rounded"
    />
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="rounded border border-slate-300 bg-slate-100 px-2 py-1.5 text-xs text-slate-600">
        {value}
      </div>
    </div>
  );
}
