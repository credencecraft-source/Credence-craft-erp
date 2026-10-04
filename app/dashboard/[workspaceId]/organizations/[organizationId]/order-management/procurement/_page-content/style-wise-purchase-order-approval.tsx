"use client";

import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { formatNumber, text } from "./style-wise-purchase-order-format";
import type { GstOption, UomConvertOption, GroupedPurchaseOrder } from "./style-wise-purchase-order-types";
export function PriceApprovalStage({
  groupedPurchaseOrders,
  gstOptions,
  loading,
  organizationId,
  onUpdated,
  onApproved,
  onError,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  groupedPurchaseOrders: GroupedPurchaseOrder[];
  gstOptions: GstOption[];
  loading: boolean;
  organizationId: string;
  onUpdated: () => Promise<void>;
  onApproved: () => void;
  onError: (message: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const priceApprovalPath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${params?.organizationId ?? organizationId}/order-management/procurement/create-po/style-wise/approve-price`;
  const [approving, setApproving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uomOptions, setUomOptions] = useState<UomConvertOption[]>([]);
  const [uomConversionOptions, setUomConversionOptions] = useState<UomConvertOption[]>([]);
  const approvedOrders = groupedPurchaseOrders.filter(
    (item) => item.status === "PRICE_APPROVED",
  );
  const masterGroupEligibleOrders = approvedOrders;
  const selectedOrder = masterGroupEligibleOrders.find((item) => selectedIds.has(item.id));
  const selectedSourceType = selectedOrder ? selectedOrder.sourceType ?? "VENDOR" : null;
  useEffect(() => {
    let mounted = true;
    const loadUomOptions = async () => {
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
        const [uomValues, conversionValues] = await Promise.all([
          uomResponse.json(),
          conversionResponse.json(),
        ]);
        if (!uomResponse.ok || !conversionResponse.ok) {
          throw new Error("Unable to load UOM conversions.");
        }
        if (mounted) {
          setUomOptions(Array.isArray(uomValues) ? uomValues : []);
          setUomConversionOptions(Array.isArray(conversionValues) ? conversionValues : []);
        }
      } catch (loadError) {
        if (mounted) {
          onError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load UOM conversions.",
          );
        }
      }
    };
    void loadUomOptions();
    return () => {
      mounted = false;
    };
  }, [organizationId, onError]);
  const saveRecord = async (
    order: GroupedPurchaseOrder,
    draft: GroupedPurchaseOrderPriceDraft,
  ) => {
    setSavingId(order.id);
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            action: "update-header",
            vendorPriceInr: draft.price,
            vendorPrice: draft.price,
            gst: draft.gst,
            gstMasterId: draft.gstMasterId,
            hsnCode: draft.hsnCode,
            buyingUom: draft.buyingUom,
            convertValue: draft.convertValue,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Unable to save ${order.groupedPoNo}.`);
      }
      await onUpdated();
    } catch (saveError) {
      onError(
        saveError instanceof Error
          ? saveError.message
          : `Unable to save ${order.groupedPoNo}.`,
      );
    } finally {
      setSavingId(null);
    }
  };
  const approveSelectedRecords = async () => {
    setApproving(true);
    try {
      const response = await fetch(
        `/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            action: "master-group",
            groupedPurchaseOrderIds: masterGroupEligibleOrders
              .filter((item) => selectedIds.has(item.id))
              .map((item) => item.id),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error || "Unable to master group the selected records.",
        );
      setSelectedIds(new Set());
      await onUpdated();
      onApproved();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to master group the selected records.",
      );
    } finally {
      setApproving(false);
    }
  };
  const approveRecord = async (order: GroupedPurchaseOrder) => {
    setApprovingId(order.id);
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, action: "approve" }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error || `Unable to approve ${order.groupedPoNo}.`,
        );
      await onUpdated();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to approve grouped PO.",
      );
    } finally {
      setApprovingId(null);
    }
  };
  const deleteRecord = async (order: GroupedPurchaseOrder) => {
    const deleteEffects = order.sourceType === "STOCK"
      ? " Its reserved stock will be released and its booking history retained."
      : " Its grouped subform records will also be deleted.";
    if (
      !window.confirm(
        `Delete Grouped PO ${order.groupedPoNo}?${deleteEffects}`,
      )
    )
      return;
    setDeletingId(order.id);
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}?organizationId=${encodeURIComponent(organizationId)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error || `Unable to delete ${order.groupedPoNo}.`,
        );
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
      await onUpdated();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to delete grouped PO.",
      );
    } finally {
      setDeletingId(null);
    }
  };
  if (loading)
    return (
      <div className="erp-surface flex min-h-40 items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading
        price approvals
      </div>
    );
  const selectedCount = masterGroupEligibleOrders.filter((item) =>
    selectedIds.has(item.id),
  ).length;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">
            Review grouped material prices
          </h2>
        </div>
        <Button
          type="button"
          disabled={approving || selectedCount < 1}
          onClick={approveSelectedRecords}
          className="rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {approving
            ? "Creating master group..."
            : `Master Group${selectedCount ? ` (${selectedCount})` : ""}`}
        </Button>
      </div>
      {groupedPurchaseOrders.length === 0 ? (
        <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">
          No grouped POs are available for price approval or Master Grouping.
        </div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3">Select</th>
                  <th className="px-3 py-3">Grouped PO</th>
                  <th className="px-3 py-3">Raw material</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Sourcing</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Price *</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3">Stock UOM</th>
                  <th className="px-3 py-3">Buying UOM *</th>
                  <th className="px-3 py-3 text-right">GST *</th>
                  <th className="px-3 py-3">HSN code *</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedPurchaseOrders.map((order) => {
                  return (
                    <GroupedPurchaseOrderPriceRow
                      key={[
                        order.id,
                        order.vendorPriceInr ?? "",
                        order.vendorPrice ?? "",
                        order.gst ?? "",
                        order.buyingUom ?? "",
                        order.convertValue ?? "",
                        order.hsnCode ?? "",
                        gstOptions.map((option) => option.id).join(","),
                      ].join("|")}
                      order={order}
                      selected={selectedIds.has(order.id)}
                      canSelect={order.status === "PRICE_APPROVED" && (selectedSourceType === null || selectedSourceType === (order.sourceType ?? "VENDOR"))}
                      saving={savingId === order.id}
                      approving={approvingId === order.id}
                      deleting={deletingId === order.id}
                      gstOptions={gstOptions}
                      uomOptions={uomOptions}
                      uomConversionOptions={uomConversionOptions}
                      onToggle={() =>
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (next.has(order.id)) next.delete(order.id);
                          else next.add(order.id);
                          return next;
                        })
                      }
                      onOpen={() =>
                        router.push(
                          `${priceApprovalPath}/${encodeURIComponent(order.id)}`,
                        )
                      }
                      onSave={(draft) => saveRecord(order, draft)}
                      onApprove={() => approveRecord(order)}
                      onDelete={() => void deleteRecord(order)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void onLoadMore()}>
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {loadingMore ? "Loading grouped POs" : "Load more grouped POs"}
          </Button>
        </div>
      )}
    </section>
  );
}
type GroupedPurchaseOrderPriceDraft = {
  price: string;
  gst: string;
  gstMasterId: string;
  buyingUom: string;
  convertValue: string;
  hsnCode: string;
};

function GroupedPurchaseOrderPriceRow({
  order,
  selected,
  canSelect,
  saving,
  approving,
  deleting,
  gstOptions,
  uomOptions,
  uomConversionOptions,
  onToggle,
  onOpen,
  onSave,
  onApprove,
  onDelete,
}: {
  order: GroupedPurchaseOrder;
  selected: boolean;
  canSelect: boolean;
  saving: boolean;
  approving: boolean;
  deleting: boolean;
  gstOptions: GstOption[];
  uomOptions: UomConvertOption[];
  uomConversionOptions: UomConvertOption[];
  onToggle: () => void;
  onOpen: () => void;
  onSave: (draft: GroupedPurchaseOrderPriceDraft) => Promise<void>;
  onApprove: () => Promise<void>;
  onDelete: () => void;
}) {
  const pending = order.status === "PENDING_PRICE_APPROVAL";
  const approved = order.status === "PRICE_APPROVED";
  const firstLine = order.lines[0];
  const initialPrice = String(
    order.vendorPriceInr ?? order.vendorPrice ?? firstLine?.vendorPrice ?? "",
  );
  const lineGstValues = [
    ...new Set(
      order.lines
        .map((line) => String(line.gst ?? "").trim())
        .filter((value) => value && value !== "-"),
    ),
  ];
  const initialGst =
    order.gst === null || order.gst === undefined
      ? lineGstValues.length === 1
        ? lineGstValues[0]
        : ""
      : String(order.gst);
  const lineHsnValues = [
    ...new Set(
      order.lines
        .map((line) => String(line.hsnCode ?? "").trim())
        .filter((value) => value && value !== "-"),
    ),
  ];
  const initialHsnCode =
    order.hsnCode ?? (lineHsnValues.length === 1 ? lineHsnValues[0] : "");
  const initialGstMasterId =
    !initialGst
      ? ""
      : gstOptions.find(
          (option) =>
            Number(option.fields?.Gst ?? option.fields?.gst) === Number(initialGst),
        )?.id ?? "";
  const [price, setPrice] = useState(initialPrice);
  const [gstMasterId, setGstMasterId] = useState(initialGstMasterId);
  const [buyingUom, setBuyingUom] = useState(order.buyingUom ?? "");
  const [convertValue, setConvertValue] = useState(
    String(order.convertValue ?? ""),
  );
  const [hsnCode, setHsnCode] = useState(initialHsnCode);
  const selectedGst = gstOptions.find((option) => option.id === gstMasterId);
  const gst = String(
    selectedGst?.fields?.Gst ?? selectedGst?.fields?.gst ?? "",
  );
  const stockUom = String(order.stockUom ?? firstLine?.stockUom ?? "")
    .trim()
    .toLowerCase();
  const stockUomRecord = uomOptions.find(
    (option) => String(option.label ?? "").trim().toLowerCase() === stockUom,
  );
  const availableBuyingUoms = uomConversionOptions.filter(
    (option) =>
      option.parent_id === stockUomRecord?.id ||
      option.parent_id === stockUomRecord?.value_id,
  );
  const hasChanges =
    price !== initialPrice ||
    gstMasterId !== initialGstMasterId ||
    buyingUom !== (order.buyingUom ?? "") ||
    convertValue !== String(order.convertValue ?? "") ||
    hsnCode !== initialHsnCode;
  const validDraft =
    price.trim() !== "" &&
    Number.isFinite(Number(price)) &&
    Number(price) >= 0 &&
    Boolean(gstMasterId && gst) &&
    Boolean(buyingUom && Number(convertValue) > 0) &&
    Boolean(hsnCode.trim());

  const save = async () => {
    if (!validDraft) return;
    await onSave({ price, gst, gstMasterId, buyingUom, convertValue, hsnCode });
  };
  const total = order.lines.reduce(
    (sum, line) =>
      sum +
      Number(line.groupedQty ?? 0) *
        (price.trim() !== "" ? Number(price) : Number(line.vendorPrice ?? 0)),
    0,
  );
  const quantity = Number(
    order.totalGroupedQty ??
      order.lines.reduce(
        (totalQty, line) => totalQty + Number(line.groupedQty ?? 0),
        0,
      ),
  );

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer bg-white transition hover:bg-blue-50"
    >
      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${order.groupedPoNo}`}
          disabled={!canSelect}
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td className="px-3 py-3 font-bold text-slate-900">
        {order.groupedPoNo}
      </td>
      <td className="px-3 py-3 font-semibold text-slate-800">
        {text(order.rawMaterial)}
      </td>
      <td className="px-3 py-3 text-slate-700">{order.vendor.name}</td>
      <td className="px-3 py-3">
        <span className={`rounded px-2 py-1 text-[9px] font-bold ${order.sourceType === "STOCK" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
          {order.sourceType === "STOCK" ? "Inventory" : "Supplier PO"}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`rounded-full px-2 py-1 text-[9px] font-bold ${pending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
        >
          {pending
            ? "Pending price"
            : approved
              ? "Price approved"
              : "Master grouped"}
        </span>
      </td>
      <td className="px-3 py-3 text-right" onClick={(event) => event.stopPropagation()}>
        {pending ? (
          <Input
            aria-label={`Price for ${order.groupedPoNo}`}
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:border-emerald-500"
          />
        ) : (
          <span className="font-bold text-emerald-700">
            {formatNumber(Number(price))}
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-slate-700">
        {formatNumber(quantity)}
      </td>
      <td className="px-3 py-3 text-slate-700">
        {text(order.stockUom ?? firstLine?.stockUom)}
      </td>
      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
        {pending ? (
          <Select
            aria-label={`Buying UOM for ${order.groupedPoNo}`}
            value={buyingUom}
            onChange={(event) => {
              const option = availableBuyingUoms.find(
                (item) => item.label === event.target.value,
              );
              setBuyingUom(event.target.value);
              setConvertValue(
                String(
                  option?.fields?.How_Many ??
                    option?.fields?.how_many ??
                    "",
                ),
              );
            }}
            className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">Select UOM</option>
            {buyingUom &&
            !availableBuyingUoms.some((option) => option.label === buyingUom) ? (
              <option value={buyingUom}>{buyingUom} (current)</option>
            ) : null}
            {availableBuyingUoms.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : (
          text(buyingUom)
        )}
      </td>
      <td className="px-3 py-3 text-right" onClick={(event) => event.stopPropagation()}>
        {pending ? (
          <Select
            aria-label={`GST for ${order.groupedPoNo}`}
            value={gstMasterId}
            onChange={(event) => setGstMasterId(event.target.value)}
            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">Select GST</option>
            {gstOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} (
                {String(option.fields?.Gst ?? option.fields?.gst ?? "-")}%)
              </option>
            ))}
          </Select>
        ) : (
          text(order.gst ?? (lineGstValues.length === 1 ? lineGstValues[0] : null))
        )}
      </td>
      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
        {pending ? (
          <Input
            aria-label={`HSN code for ${order.groupedPoNo}`}
            value={hsnCode}
            onChange={(event) => setHsnCode(event.target.value)}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-emerald-500"
          />
        ) : (
          text(order.hsnCode ?? (lineHsnValues.length === 1 ? lineHsnValues[0] : null))
        )}
      </td>
      <td className="px-3 py-3 text-right font-bold text-slate-900">
        {formatNumber(total)}
      </td>
      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          {pending ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving || !hasChanges || !validDraft}
                title={!validDraft ? "Enter a valid price, GST, buying UOM, and HSN code before saving." : undefined}
                onClick={() => void save()}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save record"}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={approving || saving || hasChanges || !validDraft}
                onClick={() => void onApprove()}
                title={
                  !validDraft
                    ? "Enter a valid price, GST, buying UOM, and HSN code."
                    : hasChanges
                      ? "Save this record before approval."
                      : undefined
                }
                className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approving ? "Approving..." : "Approve price"}
              </Button>
            </>
          ) : approved ? (
            <span className="text-[10px] font-semibold text-emerald-700">
              {order.sourceType === "STOCK" ? "Stock cost approved" : "Ready for Master Group"}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-slate-500">
              Master grouped
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={onDelete}
            aria-label={`Delete ${order.groupedPoNo}`}
            title="Delete Grouped PO"
            className="h-7 min-h-7 w-7 rounded-md border border-red-200 p-0 text-red-600 hover:bg-red-50"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}
