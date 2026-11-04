"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { toggleVisibleReportSelection } from "@/components/reports/report-grid-filtering";
import { fetchDefaultOrganizationPrintTemplateDesign } from "@/lib/services/distribution/organization-print-template-client";
import { DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN } from "@/lib/services/distribution/organization-print-template-contract";
import { openPdfPrintPreviewWindow } from "@/lib/services/distribution/print-preview-window";
import type { DistributionQuotationSummary } from "../../quotation/_page-content/quotation-types";

type SalesOrderRow = DistributionQuotationSummary & { childCount: number };
type SalesOrderAllocationMode = "GENERAL" | "PRODUCTION";
type SalesOrderAllocationSize = {
  size: string;
  bookedQuantity: number;
  assignedQuantity: number;
  unassignedQuantity: number;
  allocatableQuantity: number;
  generalStockQuantity: number;
};
type SalesOrderAllocationWorkOrder = {
  id: string;
  workOrderNo: string;
  status: string;
  sizeLines: Array<{ size: string; availableQuantity: number }>;
};
type SalesOrderAllocationOrder = {
  orderId: string;
  orderNo: string;
  bookingCount: number;
  totalBooked: number;
  totalUnassigned: number;
  totalAllocatableQuantity: number;
  totalGeneralStock: number;
  sizes: SalesOrderAllocationSize[];
  workOrders: SalesOrderAllocationWorkOrder[];
  selectedWorkOrderId: string;
};
type SalesOrderAllocationData = {
  salesOrderNo: string;
  orders: SalesOrderAllocationOrder[];
};
type SalesOrderAllocationResult = {
  mode: SalesOrderAllocationMode;
  allocatedBookings: number;
  allocatedOrders: number;
  allocatedQuantity: number;
};
type SalesOrderField = "quotationNo" | "orderNo" | "customer" | "childCount" | "totalQuantity" | "subtotal" | "createdAt";
type SalesOrderPdfAddress = { lines: string[]; gstin: string | null } | null;
type SalesOrderPdfLine = {
  description: string;
  brand: string;
  styleName: string;
  bookingNo: string;
  orderNo: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  totalAmount: string;
  taxAmount: string;
  sizes: Array<{ size: string; bookedQuantity: number }>;
};
type SalesOrderPdfChild = {
  quotationNo: string;
  quotationDate: string;
  validUntil: string;
  orderNo: string;
  status: string;
  totalQuantity: number;
  subtotal: string;
  deliveryCharge: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  vatAmount: string;
  salesTaxAmount: string;
  taxAmount: string;
  grandTotal: string;
  notes: string;
  lines: SalesOrderPdfLine[];
  quotationParty: SalesOrderPdfParty;
};
type SalesOrderPdfParty = {
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  registeredState: string | null;
  billingAddress: SalesOrderPdfAddress;
  shippingAddress: SalesOrderPdfAddress;
};
type SalesOrderPdfPayload = {
  quotation: {
    id: string;
    quotationNo: string;
    quotationDate: string;
    validUntil: string;
    orderNo: string;
    customer: string;
    notes: string;
    status: string;
    totalQuantity: number;
    subtotal: string;
    deliveryCharge: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    vatAmount: string;
    salesTaxAmount: string;
    taxAmount: string;
    grandTotal: string;
  };

  children: SalesOrderPdfChild[];
  salesOrderDocument: {
    seller: { name: string; email: string | null; phone: string | null; gstin: string; address: string };
    buyer: SalesOrderPdfParty;
  };
};

function hexToRgb(hexColor: string): [number, number, number] {
  const value = hexColor.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

const fields: Array<{ key: SalesOrderField; label: string }> = [
  { key: "quotationNo", label: "Sales Order No" },
  { key: "orderNo", label: "Order No" },
  { key: "customer", label: "Customer / Contact" },
  { key: "childCount", label: "Child Quotations" },
  { key: "totalQuantity", label: "Total Qty" },
  { key: "subtotal", label: "Subtotal" },
  { key: "createdAt", label: "Created Date" },
];

function getSalesOrderRowId(order: SalesOrderRow) {
  return order.id;
}

function renderSalesOrderCell(fieldKey: string, order: SalesOrderRow) {
  if (fieldKey === "createdAt") return order.createdAt.slice(0, 10);
  const value = order[fieldKey as keyof SalesOrderRow];
  return value === null || value === undefined ? "" : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function addMoneyAmounts(...values: string[]) {
  const amounts = values.map((value) => {
    if (!/^\d{1,16}\.\d{2}$/.test(value)) {
      throw new Error("Sales Order tax totals contained invalid monetary data.");
    }
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(fraction);
  });
  const total = amounts.reduce((sum, amount) => sum + amount, BigInt(0));
  return `${total / BigInt(100)}.${String(total % BigInt(100)).padStart(2, "0")}`;
}

function isMoneyAmount(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,16}\.\d{2}$/.test(value);
}

function isSalesOrderPdfAddress(value: unknown): value is SalesOrderPdfAddress {
  return value === null || (
    isRecord(value) &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === "string") &&
    isNullableString(value.gstin)
  );
}

function isSalesOrderPdfPayload(value: unknown): value is SalesOrderPdfPayload {
  if (!isRecord(value) || !isRecord(value.quotation) || !isRecord(value.salesOrderDocument)) return false;
  const { quotation, salesOrderDocument } = value;
  if (!isRecord(salesOrderDocument.seller) || !isRecord(salesOrderDocument.buyer) || !Array.isArray(value.children)) return false;
  const requiredQuotationStrings = [
    "id", "quotationNo", "quotationDate", "validUntil", "orderNo", "customer", "notes", "status",
    "subtotal", "deliveryCharge", "cgstAmount", "sgstAmount", "igstAmount", "vatAmount",
    "salesTaxAmount", "taxAmount", "grandTotal",
  ];
  if (requiredQuotationStrings.some((key) => typeof quotation[key] !== "string") ||
      ["subtotal", "deliveryCharge", "cgstAmount", "sgstAmount", "igstAmount", "vatAmount", "salesTaxAmount", "taxAmount", "grandTotal"]
        .some((key) => !isMoneyAmount(quotation[key])) ||
      typeof quotation.totalQuantity !== "number" ||
      typeof salesOrderDocument.seller.name !== "string" ||
      typeof salesOrderDocument.seller.gstin !== "string" ||
      typeof salesOrderDocument.seller.address !== "string" ||
      !isNullableString(salesOrderDocument.seller.email) ||
      !isNullableString(salesOrderDocument.seller.phone) ||
      typeof salesOrderDocument.buyer.name !== "string" ||
      !isNullableString(salesOrderDocument.buyer.legalName) ||
      !isNullableString(salesOrderDocument.buyer.email) ||
      !isNullableString(salesOrderDocument.buyer.phone) ||
      !isNullableString(salesOrderDocument.buyer.gstin) ||
      !isNullableString(salesOrderDocument.buyer.registeredState) ||
      !isSalesOrderPdfAddress(salesOrderDocument.buyer.billingAddress) ||
      !isSalesOrderPdfAddress(salesOrderDocument.buyer.shippingAddress)) return false;
  return value.children.every((child) => isRecord(child) &&
    typeof child.quotationNo === "string" &&
    typeof child.quotationDate === "string" &&
    typeof child.validUntil === "string" &&
    typeof child.orderNo === "string" &&
    typeof child.status === "string" &&
    typeof child.totalQuantity === "number" &&
    typeof child.subtotal === "string" &&
    typeof child.deliveryCharge === "string" &&
    typeof child.cgstAmount === "string" &&
    typeof child.sgstAmount === "string" &&
    typeof child.igstAmount === "string" &&
    typeof child.vatAmount === "string" &&
    typeof child.salesTaxAmount === "string" &&
    typeof child.taxAmount === "string" &&
    isMoneyAmount(child.subtotal) &&
    isMoneyAmount(child.deliveryCharge) &&
    isMoneyAmount(child.cgstAmount) &&
    isMoneyAmount(child.sgstAmount) &&
    isMoneyAmount(child.igstAmount) &&
    isMoneyAmount(child.vatAmount) &&
    isMoneyAmount(child.salesTaxAmount) &&
    isMoneyAmount(child.taxAmount) &&
    isMoneyAmount(child.grandTotal) &&
    typeof child.notes === "string" &&
    isRecord(child.quotationParty) &&
    typeof child.quotationParty.name === "string" &&
    isNullableString(child.quotationParty.legalName) &&
    isNullableString(child.quotationParty.email) &&
    isNullableString(child.quotationParty.phone) &&
    isNullableString(child.quotationParty.gstin) &&
    isNullableString(child.quotationParty.registeredState) &&
    isSalesOrderPdfAddress(child.quotationParty.billingAddress) &&
    isSalesOrderPdfAddress(child.quotationParty.shippingAddress) &&
    Array.isArray(child.lines) &&
    child.lines.every((line) => isRecord(line) &&
      typeof line.description === "string" &&
      typeof line.brand === "string" &&
      typeof line.styleName === "string" &&
      typeof line.bookingNo === "string" &&
      typeof line.orderNo === "string" &&
      typeof line.quantity === "number" &&
      typeof line.unitPrice === "string" &&
      typeof line.lineTotal === "string" &&
      isMoneyAmount(line.lineTotal) &&
      isMoneyAmount(line.totalAmount) &&
      isMoneyAmount(line.taxAmount) &&
      Array.isArray(line.sizes) &&
      line.sizes.every((size) => isRecord(size) && typeof size.size === "string" && typeof size.bookedQuantity === "number")));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSalesOrderAllocationData(value: unknown): value is SalesOrderAllocationData {
  return isRecord(value) &&
    typeof value.salesOrderNo === "string" &&
    Array.isArray(value.orders) &&
    value.orders.every((order) =>
      isRecord(order) &&
      typeof order.orderId === "string" &&
      typeof order.orderNo === "string" &&
      isNonNegativeInteger(order.bookingCount) &&
      isNonNegativeInteger(order.totalBooked) &&
      isNonNegativeInteger(order.totalUnassigned) &&
      isNonNegativeInteger(order.totalAllocatableQuantity) &&
      isNonNegativeInteger(order.totalGeneralStock) &&
      typeof order.selectedWorkOrderId === "string" &&
      Array.isArray(order.sizes) &&
      order.sizes.every((size) =>
        isRecord(size) &&
        typeof size.size === "string" &&
        isNonNegativeInteger(size.bookedQuantity) &&
        isNonNegativeInteger(size.assignedQuantity) &&
        isNonNegativeInteger(size.unassignedQuantity) &&
        isNonNegativeInteger(size.allocatableQuantity) &&
        isNonNegativeInteger(size.generalStockQuantity)) &&
      Array.isArray(order.workOrders) &&
      order.workOrders.every((workOrder) =>
        isRecord(workOrder) &&
        typeof workOrder.id === "string" &&
        typeof workOrder.workOrderNo === "string" &&
        typeof workOrder.status === "string" &&
        Array.isArray(workOrder.sizeLines) &&
        workOrder.sizeLines.every((line) =>
          isRecord(line) &&
          typeof line.size === "string" &&
          isNonNegativeInteger(line.availableQuantity))));
}

async function fetchSalesOrderAllocationData(
  organizationId: string,
  salesOrderId: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ organizationId });
  const response = await fetch(
    `/api/distribution/quotations/${encodeURIComponent(salesOrderId)}/allocation?${query}`,
    { cache: "no-store", signal },
  );
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(isRecord(value) && typeof value.error === "string"
      ? value.error
      : "Unable to load Sales Order allocation.");
  }
  if (!isSalesOrderAllocationData(value)) {
    throw new Error("The Sales Order allocation response was incomplete.");
  }
  return value;
}

export default function SalesOrderListPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const [quotations, setQuotations] = useState<DistributionQuotationSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<SalesOrderField[]>(fields.map(({ key }) => key));
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [pdfLoadingOrderId, setPdfLoadingOrderId] = useState<string | null>(null);
  const [autoAllocateOrder, setAutoAllocateOrder] = useState<SalesOrderRow | null>(null);
  const [allocationMode, setAllocationMode] = useState<SalesOrderAllocationMode | null>(null);
  const [allocationData, setAllocationData] = useState<SalesOrderAllocationData | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState("");
  const [allocationNotice, setAllocationNotice] = useState("");
  const [isAllocating, setIsAllocating] = useState(false);
  const [showAllocationConfirmation, setShowAllocationConfirmation] = useState(false);
  const [selectedWorkOrders, setSelectedWorkOrders] = useState<Record<string, string>>({});
  const listRequestRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const loadQuotations = useCallback(async (cursor?: string) => {
    if (cursor && loadingMoreRef.current) return;
    loadingMoreRef.current = Boolean(cursor);
    if (cursor) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setIsLoadingMore(false);
      setNextCursor(null);
    }
    listRequestRef.current?.abort();
    const controller = new AbortController();
    listRequestRef.current = controller;
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      query.set("view", "sales-order");
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/distribution/quotations?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (
        !response.ok ||
        !Array.isArray(data?.quotations) ||
        !(typeof data.nextCursor === "string" || data.nextCursor === null)
      ) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load sales orders.");
      }
      const pageQuotations = data.quotations as DistributionQuotationSummary[];
      setQuotations((current) => cursor ? [...current, ...pageQuotations] : pageQuotations);
      setNextCursor(data.nextCursor);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load sales orders.");
      }
    } finally {
      if (listRequestRef.current === controller) {
        listRequestRef.current = null;
        loadingMoreRef.current = false;
        if (cursor) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    }
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadQuotations();
    });
    return () => {
      active = false;
      listRequestRef.current?.abort();
      listRequestRef.current = null;
      loadingMoreRef.current = false;
    };
  }, [loadQuotations]);

  useEffect(() => {
    if (!autoAllocateOrder) return;
    const controller = new AbortController();
    void fetchSalesOrderAllocationData(organizationId, autoAllocateOrder.id, controller.signal)
      .then((data) => {
        setAllocationData(data);
        setSelectedWorkOrders(Object.fromEntries(data.orders.map((order) => [
          order.orderId,
          order.selectedWorkOrderId,
        ])));
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setAllocationError(loadError instanceof Error ? loadError.message : "Unable to load Sales Order allocation.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setAllocationLoading(false);
      });
    return () => controller.abort();
  }, [autoAllocateOrder, organizationId]);

  const salesOrders = useMemo<SalesOrderRow[]>(
    () => quotations.map((quotation) => ({ ...quotation, childCount: quotation.childCount ?? 0 })),
    [quotations],
  );

  function openDetails(id: string) {
    router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/sales-order/${encodeURIComponent(id)}`);
  }

  function requestBulkDelete() {
    const selectedIdSet = new Set(selectedIds);
    const selectedOrders = salesOrders.filter((order) => selectedIdSet.has(order.id));
    if (selectedOrders.length !== selectedIds.length) {
      setError("One or more selected sales orders are no longer in this report. Refresh and select them again.");
      return;
    }
    if (selectedOrders.some((order) => order.status !== "DRAFT")) {
      setError("Only draft sales orders can be deleted.");
      return;
    }
    setError("");
    setNotice("");
    setIsBulkDeleteDialogOpen(true);
  }

  async function deleteSelectedSalesOrders() {
    if (isBulkDeleting || selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/distribution/quotations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, quotationIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.deleted) || data.deleted.length !== selectedIds.length) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to delete the selected sales orders.");
      }
      const deletedRecords: unknown[] = data.deleted;
      const deletedCount = deletedRecords.length;
      const unlinkedCount = deletedRecords.reduce<number>((sum, item) => {
        if (!isRecord(item) || !isNonNegativeInteger(item.unlinkedQuotationCount)) return sum;
        return sum + item.unlinkedQuotationCount;
      }, 0);
      setSelectedIds([]);
      setIsBulkDeleteDialogOpen(false);
      setNotice(
        `Deleted ${deletedCount} sales order${deletedCount === 1 ? "" : "s"}; ${unlinkedCount} linked quotation${unlinkedCount === 1 ? "" : "s"} remain in the quotation register.`,
      );
      const deletedIds = new Set(selectedIds);
      setQuotations((current) => current
        .filter((quotation) => !deletedIds.has(quotation.id))
        .map((quotation) => quotation.parentQuotationId && deletedIds.has(quotation.parentQuotationId)
          ? { ...quotation, parentQuotationId: null }
          : quotation));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the selected sales orders.");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function openAutoAllocation(order: SalesOrderRow) {
    setAllocationMode(null);
    setAllocationData(null);
    setAllocationError("");
    setAllocationNotice("");
    setAllocationLoading(true);
    setIsAllocating(false);
    setShowAllocationConfirmation(false);
    setSelectedWorkOrders({});
    setAutoAllocateOrder(order);
  }

  function closeAutoAllocation() {
    if (isAllocating) return;
    setAutoAllocateOrder(null);
    setAllocationMode(null);
    setAllocationData(null);
    setAllocationError("");
    setAllocationNotice("");
    setShowAllocationConfirmation(false);
  }

  async function openSalesOrderPrintView(order: SalesOrderRow) {
    if (pdfLoadingOrderId) return;
    const printPreview = openPdfPrintPreviewWindow(`Sales Order ${order.quotationNo}`);
    if (!printPreview) {
      setPdfError("Allow pop-ups to open the Sales Order print view.");
      return;
    }
    setPdfLoadingOrderId(order.id);
    setPdfError("");
    try {
      const workspaceId = String(params.workspaceId);
      const query = new URLSearchParams({ organizationId, mode: "MASTER_PDF" });
      const [response, designConfig] = await Promise.all([
        fetch(`/api/distribution/quotations/${encodeURIComponent(order.id)}?${query}`, { cache: "no-store" }),
        fetchDefaultOrganizationPrintTemplateDesign(workspaceId, organizationId, "SALES_ORDER"),
      ]);
      const printDesign = designConfig ?? DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN;
      const responseData: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = isRecord(responseData) && typeof responseData.error === "string"
          ? responseData.error
          : "Unable to load Sales Order details for printing.";
        throw new Error(message);
      }
      if (!isSalesOrderPdfPayload(responseData)) {
        throw new Error("The Sales Order details returned an incomplete print document.");
      }
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const document = new jsPDF({
        orientation: printDesign.orientation === "LANDSCAPE" ? "landscape" : "portrait",
        unit: "mm",
        format: printDesign.pageSize.toLowerCase(),
      });
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      const margin = printDesign.margins.left;
      const rightMargin = printDesign.margins.right;
      const bottomMargin = printDesign.margins.bottom;
      const topOffset = printDesign.margins.top - 12;
      const contentWidth = pageWidth - margin - rightMargin;
      const fontFamily = printDesign.fontFamily;
      const headingFontSize = printDesign.headingFontSize;
      const bodyFontSize = printDesign.bodyFontSize;
      const accentColor = hexToRgb(printDesign.accentColor);
      const textColor = hexToRgb(printDesign.textColor);
      const tableHeaderColor = hexToRgb(printDesign.tableHeaderColor);
      const tableHeaderTextColor = hexToRgb(printDesign.tableHeaderTextColor);
      const scaledWidth = (width: number) => width * (contentWidth / 186);
      const headerLines = printDesign.headerText
        ? document.splitTextToSize(printDesign.headerText, contentWidth)
        : [];
      const headerOffset = Math.min(headerLines.length * 3, 24);
      const headerFields = new Set(printDesign.sections.headerFields);
      const { quotation, children, salesOrderDocument } = responseData;
      const { seller } = salesOrderDocument;
      const partyAddressLines = (party: SalesOrderPdfParty, type: "billingAddress" | "shippingAddress") =>
        party[type]?.lines ?? party.billingAddress?.lines ?? party.shippingAddress?.lines ?? [];
      const display = (value: string | number | null | undefined) => {
        const clean = String(value ?? "").trim();
        return clean || "Not provided";
      };
      const date = (value: string) => {
        if (!value) return "Not provided";
        const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-IN");
      };
      const money = (value: string) => {
        if (!isMoneyAmount(value)) return value;
        const [whole, fraction = ""] = value.split(".");
        const wholeNumber = BigInt(whole);
        const groupedWhole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(wholeNumber);
        const currencyParts = new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).formatToParts(0);
        return currencyParts.map((part) => {
          if (part.type === "integer") return groupedWhole;
          if (part.type === "fraction") return fraction;
          return part.value;
        }).join("");
      };
      const itemColumnDefinitions: Array<{
        key: string;
        label: string;
        getValue: (line: SalesOrderPdfLine) => string;
      }> = [
        {
          key: "description",
          label: "Item / Description",
          getValue: (line) => line.description + (line.brand || line.styleName
            ? `\n${[line.brand, line.styleName].filter(Boolean).join(" / ")}`
            : ""),
        },
        { key: "booking", label: "Booking", getValue: (line) => line.bookingNo },
        { key: "order", label: "Order", getValue: (line) => line.orderNo },
        {
          key: "sizeBreakdown",
          label: "Size Breakdown",
          getValue: (line) => line.sizes.map((size) => `${size.size}: ${size.bookedQuantity}`).join(", ") || "-",
        },
        { key: "quantity", label: "Qty", getValue: (line) => String(line.quantity) },
        { key: "unitPrice", label: "Unit Price", getValue: (line) => money(line.unitPrice) },
        { key: "beforeTax", label: "Before Tax", getValue: (line) => money(line.lineTotal) },
        { key: "tax", label: "Tax", getValue: (line) => money(line.taxAmount) },
        { key: "amount", label: "Amount", getValue: (line) => money(line.totalAmount) },
      ];
      const visibleItemColumns = itemColumnDefinitions.filter(({ key }) =>
        printDesign.sections.itemFields.includes(key),
      );
      const safeFilename = quotation.quotationNo.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "sales-order";

      document.setProperties({ title: `Sales Order ${quotation.quotationNo}`, subject: "Sales Order and linked quotations" });
      const partyGap = 6;
      const partyWidth = (contentWidth - partyGap) / 2;
      const partyHeight = 48;
      const renderDocumentHeader = (
        title: string,
        number: string,
        dateText: string,
        statusText: string,
        headerParty = {
          name: seller.name,
          email: seller.email,
          phone: seller.phone,
          gstin: seller.gstin || null,
          address: seller.address,
        },
      ) => {
        document.setFillColor(...accentColor);
        document.rect(0, 0, pageWidth, 8, "F");
        const hasLogo = headerFields.has("companyLogo") && Boolean(printDesign.logoDataUrl);
        if (hasLogo) {
          document.addImage(
            printDesign.logoDataUrl,
            printDesign.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG",
            margin,
            10,
            16,
            12,
          );
        }
        const companyX = margin + (hasLogo ? 20 : 0);
        if (headerFields.has("companyName")) {
          document.setFont(fontFamily, "bold");
          document.setFontSize(headingFontSize);
          document.setTextColor(...textColor);
          document.text(display(headerParty.name), companyX, 19, { maxWidth: 75 });
          document.setFont(fontFamily, "normal");
          document.setFontSize(bodyFontSize);
          document.setTextColor(71, 85, 105);
          const sellerMeta = [
            headerParty.address,
            headerParty.email,
            headerParty.phone ? `Phone: ${headerParty.phone}` : "",
            headerParty.gstin ? `GSTIN: ${headerParty.gstin}` : "",
          ].filter((line): line is string => Boolean(line));
          document.text(sellerMeta, companyX, 25, { maxWidth: 75 });
        }
        document.setFont(fontFamily, "bold");
        document.setFontSize(headingFontSize + 2);
        document.setTextColor(...accentColor);
        document.text(title, pageWidth - rightMargin, 18, { align: "right", maxWidth: 95 });
        if (headerFields.has("documentNumber")) {
          document.setFontSize(bodyFontSize + 1);
          document.setTextColor(...textColor);
          document.text(`No. ${display(number)}`, pageWidth - rightMargin, 25, { align: "right" });
        }
        if (headerFields.has("documentDate") || headerFields.has("status")) {
          document.setFont(fontFamily, "normal");
          document.setFontSize(bodyFontSize);
          document.setTextColor(71, 85, 105);
          if (headerFields.has("documentDate")) {
            document.text(`Date: ${date(dateText)}`, pageWidth - rightMargin, 30, { align: "right" });
          }
          if (headerFields.has("status")) {
            document.text(statusText, pageWidth - rightMargin, headerFields.has("documentDate") ? 35 : 30, { align: "right" });
          }
        }
        if (headerLines.length) {
          document.setTextColor(...textColor);
          document.text(headerLines, pageWidth / 2, 40, { align: "center", maxWidth: contentWidth });
        }
      };
      const renderParty = (
        x: number,
        y: number,
        title: string,
        name: string,
        legalName: string | null,
        gstin: string | null,
        email: string | null,
        phone: string | null,
        addressLines: string[],
        state: string | null,
        width = partyWidth,
      ) => {
        document.setDrawColor(226, 232, 240);
        document.setFillColor(248, 250, 252);
        y += topOffset + headerOffset;
        document.roundedRect(x, y, width, partyHeight, 1.5, 1.5, "FD");
        document.setFont(fontFamily, "bold");
        document.setFontSize(Math.max(bodyFontSize, 6));
        document.setTextColor(...accentColor);
        document.text(title.toUpperCase(), x + 4, y + 6);
        document.setTextColor(...textColor);
        document.setFontSize(bodyFontSize + 2);
        document.text(display(name), x + 4, y + 12, { maxWidth: width - 8 });
        document.setFont(fontFamily, "normal");
        document.setFontSize(Math.max(bodyFontSize - 1.5, 6));
        document.setTextColor(71, 85, 105);
        const lines = [
          ...(legalName && legalName !== name ? [legalName] : []),
          ...addressLines,
          ...(gstin ? [`GSTIN: ${gstin}`] : []),
          ...(state ? [`State: ${state}`] : []),
          ...(email ? [email] : []),
          ...(phone ? [`Phone: ${phone}`] : []),
        ];
        document.text(lines.length ? lines : ["Address and tax details not provided"], x + 4, y + 17, {
          maxWidth: width - 8,
          lineHeightFactor: 1.05,
        });
      };
      const renderPartyPair = (
        y: number,
        leftTitle: string,
        left: { name: string; legalName: string | null; email: string | null; phone: string | null; gstin: string | null; addressLines: string[]; state: string | null },
        rightTitle: string,
        right: { name: string; legalName: string | null; email: string | null; phone: string | null; gstin: string | null; addressLines: string[]; state: string | null },
      ) => {
        renderParty(margin, y, leftTitle, left.name, left.legalName, left.gstin, left.email, left.phone, left.addressLines, left.state);
        renderParty(margin + partyWidth + partyGap, y, rightTitle, right.name, right.legalName, right.gstin, right.email, right.phone, right.addressLines, right.state);
      };
      const renderSectionTitle = (title: string, y: number) => {
        document.setFont(fontFamily, "bold");
        document.setFontSize(bodyFontSize + 2);
        document.setTextColor(...textColor);
        document.text(title, margin, y + topOffset + headerOffset);
      };
      const tableStyles = {
        theme: "grid" as const,
        headStyles: { fillColor: tableHeaderColor, textColor: tableHeaderTextColor, fontStyle: "bold" as const, fontSize: bodyFontSize, cellPadding: 2 },
        bodyStyles: { fontSize: bodyFontSize, cellPadding: 2, textColor, valign: "middle" as const },
        alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
        styles: { font: fontFamily, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.2, overflow: "linebreak" as const },
      };

      const quotationSummaryRows = children.map((child, index) => [
        String(index + 1),
        "READY GARMENTS",
        child.quotationNo,
        child.quotationParty.name,
        String(child.totalQuantity),
        money(child.subtotal),
        money(child.taxAmount),
        money(child.grandTotal),
      ]);
      renderDocumentHeader("SALES ORDER", quotation.quotationNo, quotation.quotationDate, `Status: ${display(quotation.status)}`);
      const salesOrderBuyer = salesOrderDocument.buyer;
      const billToParty = {
        name: salesOrderBuyer.name,
        legalName: salesOrderBuyer.legalName,
        email: salesOrderBuyer.email,
        phone: salesOrderBuyer.phone,
        gstin: salesOrderBuyer.billingAddress?.gstin ?? salesOrderBuyer.gstin,
        addressLines: partyAddressLines(salesOrderBuyer, "billingAddress"),
        state: salesOrderBuyer.registeredState,
      };
      const shipToParty = {
        ...billToParty,
        gstin: salesOrderBuyer.shippingAddress?.gstin ?? salesOrderBuyer.gstin,
        addressLines: partyAddressLines(salesOrderBuyer, "shippingAddress"),
      };
      const showBillTo = headerFields.has("billTo");
      const showShipTo = headerFields.has("shipTo");
      if (showBillTo && showShipTo) {
        renderPartyPair(42, "Bill To", billToParty, "Ship To", shipToParty);
      } else if (showBillTo) {
        renderParty(
          margin, 42, "Bill To", billToParty.name, billToParty.legalName, billToParty.gstin,
          billToParty.email, billToParty.phone, billToParty.addressLines, billToParty.state, contentWidth,
        );
      } else if (showShipTo) {
        renderParty(
          margin, 42, "Ship To", shipToParty.name, shipToParty.legalName, shipToParty.gstin,
          shipToParty.email, shipToParty.phone, shipToParty.addressLines, shipToParty.state, contentWidth,
        );
      }
      const summaryValueByField: Record<string, string> = {
        totalQuantity: `${quotation.totalQuantity} PCS`,
        beforeTax: money(quotation.subtotal),
        deliveryCharge: money(quotation.deliveryCharge),
        cgst: money(quotation.cgstAmount),
        sgst: money(quotation.sgstAmount),
        igst: money(quotation.igstAmount),
        vatSalesTax: money(addMoneyAmounts(quotation.vatAmount, quotation.salesTaxAmount)),
        totalTax: money(quotation.taxAmount),
        grandTotal: money(quotation.grandTotal),
      };
      const summaryRows = [
        ["totalQuantity", "Total Quantity"],
        ["beforeTax", "Before Tax"],
        ["deliveryCharge", "Delivery Charge"],
        ["cgst", "CGST"],
        ["sgst", "SGST"],
        ["igst", "IGST"],
        ["vatSalesTax", "VAT / Sales Tax"],
        ["totalTax", "Total Tax"],
        ["grandTotal", "Grand Total"],
      ].filter(([key]) => printDesign.sections.summaryFields.includes(key))
        .map(([key, label]) => [label, summaryValueByField[key]]);
      let nextSummaryY = 100 + topOffset + headerOffset;
      if (summaryRows.length > 0) {
        renderSectionTitle("Sales Order Tax & Totals", 97);
        autoTable(document, {
          startY: nextSummaryY,
          margin: { left: margin, right: rightMargin, bottom: bottomMargin },
          tableWidth: contentWidth,
          body: summaryRows,
          ...tableStyles,
          theme: "grid",
          bodyStyles: { ...tableStyles.bodyStyles, fontSize: bodyFontSize, cellPadding: 1.5 },
          columnStyles: {
            0: { cellWidth: contentWidth / 2, fontStyle: "bold" },
            1: { cellWidth: contentWidth / 2, halign: "right" },
          },
        });
        nextSummaryY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextSummaryY;
      }

      const salesOrderLines = children.flatMap((child) => child.lines);
      renderSectionTitle("Sales Order Items", nextSummaryY + 9);
      autoTable(document, {
        startY: nextSummaryY + 12 + topOffset + headerOffset,
        margin: { left: margin, right: rightMargin, bottom: bottomMargin },
        tableWidth: contentWidth,
        head: [visibleItemColumns.map(({ label }) => label)],
        body: salesOrderLines.length
          ? salesOrderLines.map((line) => visibleItemColumns.map(({ getValue }) => getValue(line)))
          : [visibleItemColumns.map((_, index) => index === 0 ? "No item lines recorded" : "-")],
        ...tableStyles,
      });
      nextSummaryY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextSummaryY + 20;

      if (printDesign.sections.summaryFields.includes("linkedQuotations")) {
        renderSectionTitle("Linked Quotations", nextSummaryY + 9);
        autoTable(document, {
          startY: nextSummaryY + 12 + topOffset + headerOffset,
          margin: { left: margin, right: rightMargin, bottom: bottomMargin },
          tableWidth: contentWidth,
          head: [["SL", "Account Item", "Quotation No.", "Distributor", "Qty (PCS)", "Before Tax", "Total Tax", "Grand Total"]],
          body: quotationSummaryRows.length
            ? quotationSummaryRows
            : [["-", "-", "No linked quotations", "-", "-", "-", "-", "-"]],
          ...tableStyles,
          headStyles: { ...tableStyles.headStyles, fontSize: Math.max(bodyFontSize - 1.5, 6), cellPadding: 1.5 },
          bodyStyles: { ...tableStyles.bodyStyles, fontSize: Math.max(bodyFontSize - 1.5, 6), cellPadding: 1.5 },
          columnStyles: {
            0: { cellWidth: scaledWidth(7), halign: "center" },
            1: { cellWidth: scaledWidth(31) },
            2: { cellWidth: scaledWidth(25) },
            3: { cellWidth: scaledWidth(34) },
            4: { cellWidth: scaledWidth(13), halign: "right" },
            5: { cellWidth: scaledWidth(26), halign: "right" },
            6: { cellWidth: scaledWidth(24), halign: "right" },
            7: { cellWidth: scaledWidth(26), halign: "right" },
          },
        });
      }

      for (const child of children) {
        document.addPage();
        const quotationTo = child.quotationParty;
        const quotationHeader = {
          name: quotationTo.name,
          email: quotationTo.email,
          phone: quotationTo.phone,
          gstin: quotationTo.gstin,
          address: partyAddressLines(quotationTo, "billingAddress").join(", "),
        };
        renderDocumentHeader(
          "QUOTATION",
          child.quotationNo,
          child.quotationDate,
          `Valid until: ${date(child.validUntil)}   |   ${display(child.status)}`,
          quotationHeader,
        );
        const billingParty = {
          name: quotationTo.name,
          legalName: quotationTo.legalName,
          email: quotationTo.email,
          phone: quotationTo.phone,
          gstin: quotationTo.billingAddress?.gstin ?? quotationTo.gstin,
          addressLines: partyAddressLines(quotationTo, "billingAddress"),
          state: quotationTo.registeredState,
        };
        const shippingParty = {
          ...billingParty,
          gstin: quotationTo.shippingAddress?.gstin ?? quotationTo.gstin,
          addressLines: partyAddressLines(quotationTo, "shippingAddress"),
        };
        if (showBillTo && showShipTo) {
          renderPartyPair(42, "Bill To", billingParty, "Ship To", shippingParty);
        } else if (showBillTo) {
          renderParty(
            margin, 42, "Bill To", billingParty.name, billingParty.legalName, billingParty.gstin,
            billingParty.email, billingParty.phone, billingParty.addressLines, billingParty.state, contentWidth,
          );
        } else if (showShipTo) {
          renderParty(
            margin, 42, "Ship To", shippingParty.name, shippingParty.legalName, shippingParty.gstin,
            shippingParty.email, shippingParty.phone, shippingParty.addressLines, shippingParty.state, contentWidth,
          );
        }
        renderSectionTitle("Quotation Items", 97);
        autoTable(document, {
          startY: 100 + topOffset + headerOffset,
          margin: { left: margin, right: rightMargin, bottom: bottomMargin },
          tableWidth: contentWidth,
          head: [visibleItemColumns.map(({ label }) => label)],
          body: child.lines.length
            ? child.lines.map((line) => visibleItemColumns.map(({ getValue }) => getValue(line)))
            : [visibleItemColumns.map((_, index) => index === 0 ? "No item lines recorded" : "-")],
          ...tableStyles,
        });
        let nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 112;
        const childSummaryValueByField: Record<string, string> = {
          totalQuantity: `${child.totalQuantity} PCS`,
          beforeTax: money(child.subtotal),
          deliveryCharge: money(child.deliveryCharge),
          cgst: money(child.cgstAmount),
          sgst: money(child.sgstAmount),
          igst: money(child.igstAmount),
          vatSalesTax: money(addMoneyAmounts(child.vatAmount, child.salesTaxAmount)),
          totalTax: money(child.taxAmount),
          grandTotal: money(child.grandTotal),
        };
        const childSummaryRows = [
          ["totalQuantity", "Total Quantity"],
          ["beforeTax", "Before Tax"],
          ["deliveryCharge", "Delivery Charge"],
          ["cgst", "CGST"],
          ["sgst", "SGST"],
          ["igst", "IGST"],
          ["vatSalesTax", "VAT / Sales Tax"],
          ["totalTax", "Total Tax"],
          ["grandTotal", "Grand Total"],
        ].filter(([key]) => printDesign.sections.summaryFields.includes(key))
          .map(([key, label]) => [label, childSummaryValueByField[key]]);
        if (childSummaryRows.length > 0) {
          autoTable(document, {
          startY: nextY + 4,
          margin: { left: pageWidth - rightMargin - Math.min(82, contentWidth), right: rightMargin, bottom: bottomMargin },
          tableWidth: Math.min(82, contentWidth),
          body: childSummaryRows,
          theme: "plain",
          styles: { font: fontFamily, fontSize: bodyFontSize, cellPadding: 1.5, textColor, lineColor: [226, 232, 240], lineWidth: 0.2 },
          columnStyles: {
            0: { fontStyle: "bold", cellWidth: Math.min(50, contentWidth * 50 / 82) },
            1: { halign: "right", cellWidth: Math.min(32, contentWidth * 32 / 82) },
          },
        });
          nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 22;
        }
        if (printDesign.sections.showPaymentTerms && printDesign.sections.paymentTermsText.trim()) {
          renderSectionTitle("Payment Terms", nextY + 8);
          autoTable(document, {
            startY: nextY + 11,
            margin: { left: margin, right: rightMargin, bottom: bottomMargin },
            tableWidth: contentWidth,
            body: [[printDesign.sections.paymentTermsText]],
            theme: "plain",
            styles: { font: fontFamily, fontSize: bodyFontSize, cellPadding: 1, textColor, overflow: "linebreak" },
          });
          nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 18;
        }
        const specialNotes = [
          ...(printDesign.sections.showSpecialNotes && child.notes.trim() ? [child.notes] : []),
          ...(printDesign.sections.showSpecialNotes && printDesign.footerText.trim() ? [printDesign.footerText] : []),
        ];
        if (specialNotes.length > 0) {
          renderSectionTitle("Special Notes", nextY + 8);
          autoTable(document, {
            startY: nextY + 11,
            margin: { left: margin, right: rightMargin, bottom: bottomMargin },
            tableWidth: contentWidth,
            body: [[specialNotes.join("\n\n")]],
            theme: "plain",
            styles: { font: fontFamily, fontSize: bodyFontSize, cellPadding: 1, textColor, overflow: "linebreak" },
          });
        }
      }

      const pageCount = document.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        document.setPage(pageNumber);
        document.setDrawColor(226, 232, 240);
        const footerY = pageHeight - Math.max(bottomMargin / 2, 5);
        document.line(margin, footerY - 4, pageWidth - rightMargin, footerY - 4);
        document.setFont(fontFamily, "normal");
        document.setFontSize(Math.max(bodyFontSize - 1, 6));
        document.setTextColor(100, 116, 139);
        document.text(`Generated from Sales Order ${quotation.quotationNo}`, margin, footerY);
        if (printDesign.showPageNumbers) {
          document.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - rightMargin, footerY, { align: "right" });
        }
      }
      printPreview.show(document.output("blob"), `Sales-Order-${safeFilename}.pdf`);
    } catch (pdfGenerationError) {
      const message = pdfGenerationError instanceof Error
        ? pdfGenerationError.message
        : "Unable to create the Sales Order print view.";
      printPreview.showError(message);
      setPdfError(message);
    } finally {
      setPdfLoadingOrderId(null);
    }
  }

  async function submitSalesOrderAllocation() {
    if (!autoAllocateOrder || !allocationData || !allocationMode || isAllocating) return;
    setIsAllocating(true);
    setAllocationError("");
    setAllocationNotice("");
    try {
      const body: Record<string, unknown> = {
        organizationId,
        mode: allocationMode,
      };
      if (allocationMode === "PRODUCTION") {
        body.workOrders = allocationData.orders
          .filter((order) => order.totalUnassigned > 0)
          .map((order) => ({
          orderId: order.orderId,
          workOrderId: selectedWorkOrders[order.orderId] ?? "",
          }));
      }
      const response = await fetch(
        `/api/distribution/quotations/${encodeURIComponent(autoAllocateOrder.id)}/allocation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(value) && typeof value.error === "string"
          ? value.error
          : "Unable to allocate this Sales Order.");
      }
      if (
        !isRecord(value) ||
        value.mode !== allocationMode ||
        !isNonNegativeInteger(value.allocatedBookings) ||
        !isNonNegativeInteger(value.allocatedOrders) ||
        !isNonNegativeInteger(value.allocatedQuantity)
      ) {
        throw new Error("The Sales Order allocation response was incomplete.");
      }
      const result: SalesOrderAllocationResult = {
        mode: allocationMode,
        allocatedBookings: value.allocatedBookings,
        allocatedOrders: value.allocatedOrders,
        allocatedQuantity: value.allocatedQuantity,
      };
      setAllocationNotice(result.allocatedQuantity > 0
        ? `${result.allocatedQuantity.toLocaleString()} units allocated across ${result.allocatedBookings} bookings.`
        : "No eligible quantities were available to allocate.");
      setShowAllocationConfirmation(false);
      try {
        const refreshed = await fetchSalesOrderAllocationData(organizationId, autoAllocateOrder.id);
        setAllocationData(refreshed);
        setSelectedWorkOrders(Object.fromEntries(refreshed.orders.map((order) => [
          order.orderId,
          order.selectedWorkOrderId,
        ])));
      } catch (refreshError) {
        setAllocationError(
          `Allocation was saved, but updated balances could not be loaded: ${
            refreshError instanceof Error ? refreshError.message : "Unable to refresh balances."
          }`,
        );
      }
    } catch (saveError) {
      setAllocationError(saveError instanceof Error ? saveError.message : "Unable to allocate this Sales Order.");
    } finally {
      setIsAllocating(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="erp-eyebrow">Advance Booking / Sales Order</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Sales Orders</h1>
          <p className="mt-2 text-sm text-slate-600">Persisted sales orders and linked quotations.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/quotation`)}>
            Quotation Register
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadQuotations()} disabled={isLoading}>Refresh</Button>
        </div>
      </header>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
      {pdfError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{pdfError}</p> : null}
      <Card className="p-2 shadow-none">
        <ReportGrid
          title="Sales Order Register"
          records={salesOrders}
          isLoading={isLoading}
          fields={fields}
          visibleFields={visibleFields}
          onVisibleFieldsChange={(next) => setVisibleFields(next as SalesOrderField[])}
          storageKey={`distribution-master-quotation-report-columns:${organizationId}`}
          rowIdSelector={getSalesOrderRowId}
          selectedIds={selectedIds}
          rowSelectable={(order) => order.status === "DRAFT"}
          onToggleSelectAll={(checked, recordIds) =>
            setSelectedIds((current) => toggleVisibleReportSelection(current, recordIds, checked))
          }
          onToggleRowSelection={(id, checked) => setSelectedIds((current) =>
            checked ? current.includes(id) ? current : [...current, id] : current.filter((value) => value !== id),
          )}
          onRowClick={openDetails}
          onRowAction={openDetails}
          rowActionLabel="View Details"
          onBulkDeleteSelected={requestBulkDelete}
          bulkDeleteSelectedLabel="Delete Sales Orders"
          rowActions={(order) => (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => openAutoAllocation(order)}
              >
                Auto Allocate
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void openSalesOrderPrintView(order)}
                disabled={pdfLoadingOrderId !== null}
              >
                {pdfLoadingOrderId === order.id ? "Preparing print view..." : "Print"}
              </Button>
            </div>
          )}
          emptyMessage={isLoading ? "Loading sales orders..." : "No sales orders have been created."}
          renderCell={renderSalesOrderCell}
        />
      </Card>
      {nextCursor ? (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" onClick={() => void loadQuotations(nextCursor)} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading sales orders..." : "Load more sales orders"}
          </Button>
        </div>
      ) : null}
      <Modal
        open={isBulkDeleteDialogOpen}
        onClose={() => {
          if (!isBulkDeleting) setIsBulkDeleteDialogOpen(false);
        }}
        ariaLabelledBy="bulk-delete-sales-orders-title"
        size="square"
        variant="danger"
        closeOnBackdrop={!isBulkDeleting}
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="bulk-delete-sales-orders-title" className="text-lg font-semibold text-slate-900">Delete selected sales orders?</h2>
            <p className="mt-2 text-sm text-slate-600">
              {selectedIds.length} draft sales order{selectedIds.length === 1 ? "" : "s"} will be deleted. Their linked regular quotations will be ungrouped and kept; source bookings are not deleted.
            </p>
          </div>
          {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsBulkDeleteDialogOpen(false)} disabled={isBulkDeleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteSelectedSalesOrders()} disabled={isBulkDeleting}>
              {isBulkDeleting ? "Deleting..." : `Delete ${selectedIds.length} Sales Order${selectedIds.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={autoAllocateOrder !== null}
        onClose={closeAutoAllocation}
        ariaLabelledBy="sales-order-auto-allocation-title"
        ariaDescribedBy="sales-order-auto-allocation-description"
        closeOnBackdrop={!isAllocating}
        size="2xl"
      >
        <div className="space-y-4 p-4 sm:p-6">
          <header className="space-y-1">
            <h2 id="sales-order-auto-allocation-title" className="text-lg font-semibold text-slate-900">
              Allocate Sales Order {autoAllocateOrder?.quotationNo}
            </h2>
            <p id="sales-order-auto-allocation-description" className="text-sm text-slate-600">
              Choose an allocation path. Related bookings are grouped by source order number.
            </p>
          </header>
          {allocationError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{allocationError}</p> : null}
          {allocationNotice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{allocationNotice}</p> : null}

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Button
              type="button"
              variant="card"
              disabled={isAllocating}
              aria-pressed={allocationMode === "GENERAL"}
              className={allocationMode === "GENERAL" ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] p-4" : "p-4"}
              onClick={() => {
                setAllocationMode("GENERAL");
                setShowAllocationConfirmation(false);
                setAllocationError("");
                setAllocationNotice("");
              }}
            >
              <span className="text-base font-semibold">Allocate from General</span>
              <span className="text-sm font-normal text-slate-600">Move available General Stock into booking-specific allocated stock.</span>
            </Button>
            <Button
              type="button"
              variant="card"
              disabled={isAllocating}
              aria-pressed={allocationMode === "PRODUCTION"}
              className={allocationMode === "PRODUCTION" ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] p-4" : "p-4"}
              onClick={() => {
                setAllocationMode("PRODUCTION");
                setShowAllocationConfirmation(false);
                setAllocationError("");
                setAllocationNotice("");
              }}
            >
              <span className="text-base font-semibold">Allocate to Production</span>
              <span className="text-sm font-normal text-slate-600">Assign each source order’s remaining booking quantities to a work order.</span>
            </Button>
          </div>

          {allocationLoading ? <p role="status" className="text-sm text-slate-600">Loading grouped order balances...</p> : null}

          {allocationData && allocationMode === "GENERAL" ? (
            <section className="min-w-0 space-y-4" aria-label="General stock allocation">
              <h3 className="text-base font-semibold text-slate-900">General Stock by Source Order</h3>
              {allocationData.orders.length === 0 ? (
                <Card className="text-sm text-slate-600">No bookings are linked to this Sales Order.</Card>
              ) : allocationData.orders.map((order) => (
                <Card key={order.orderId} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">Order No: {order.orderNo}</h4>
                      <p className="text-sm text-slate-600">
                        {order.bookingCount} bookings · {order.totalBooked.toLocaleString()} booked units
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      General Stock: {order.totalGeneralStock.toLocaleString()}
                    </p>
                  </div>
                  <Table className="shadow-none">
                    <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase text-slate-600">
                      <tr>
                        <th scope="col" className="px-3 py-2">Size</th>
                        <th scope="col" className="px-3 py-2 text-right">Booked Qty</th>
                        <th scope="col" className="px-3 py-2 text-right">Unassigned Qty</th>
                        <th scope="col" className="px-3 py-2 text-right">Eligible Qty</th>
                        <th scope="col" className="px-3 py-2 text-right">General Stock Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--erp-border)]">
                      {order.sizes.map((size) => (
                        <tr key={size.size}>
                          <th scope="row" className="px-3 py-2 font-medium text-slate-900">{size.size}</th>
                          <td className="px-3 py-2 text-right">{size.bookedQuantity.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{size.unassignedQuantity.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{size.allocatableQuantity.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{size.generalStockQuantity.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ))}
            </section>
          ) : null}

          {allocationData && allocationMode === "PRODUCTION" ? (
            <section className="min-w-0 space-y-4" aria-label="Production allocation">
              <h3 className="text-base font-semibold text-slate-900">Production Work Orders by Source Order</h3>
              {allocationData.orders.length === 0 ? (
                <Card className="text-sm text-slate-600">No bookings are linked to this Sales Order.</Card>
              ) : allocationData.orders.map((order) => {
                const selectedWorkOrder = order.workOrders.find(
                  (workOrder) => workOrder.id === selectedWorkOrders[order.orderId],
                );
                return (
                  <Card key={order.orderId} className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">Order No: {order.orderNo}</h4>
                      <p className="text-sm text-slate-600">
                        {order.bookingCount} bookings · {order.totalUnassigned.toLocaleString()} units to assign
                      </p>
                    </div>
                    <Select
                      label={`Work Order for ${order.orderNo}`}
                      value={selectedWorkOrders[order.orderId] ?? ""}
                      disabled={order.workOrders.length === 0 || isAllocating}
                      onChange={(event) => setSelectedWorkOrders((current) => ({
                        ...current,
                        [order.orderId]: event.target.value,
                      }))}
                    >
                      <option value="">Select a work order</option>
                      {order.workOrders.map((workOrder) => (
                        <option key={workOrder.id} value={workOrder.id}>
                          {workOrder.workOrderNo} · {workOrder.status}
                        </option>
                      ))}
                    </Select>
                    {!order.workOrders.length ? (
                      <p className="text-sm text-amber-800">No work orders are available for this source order.</p>
                    ) : selectedWorkOrder ? (
                      <p className="text-sm text-slate-600">
                        Selected work-order capacity: {selectedWorkOrder.sizeLines
                          .map((line) => `${line.size} ${line.availableQuantity.toLocaleString()}`)
                          .join(" · ") || "No available size quantities"}
                      </p>
                    ) : null}
                    <Table className="shadow-none">
                      <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase text-slate-600">
                        <tr>
                          <th scope="col" className="px-3 py-2">Size</th>
                          <th scope="col" className="px-3 py-2 text-right">Booked Qty</th>
                          <th scope="col" className="px-3 py-2 text-right">Unassigned Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--erp-border)]">
                        {order.sizes.map((size) => (
                          <tr key={size.size}>
                            <th scope="row" className="px-3 py-2 font-medium text-slate-900">{size.size}</th>
                            <td className="px-3 py-2 text-right">{size.bookedQuantity.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">{size.unassignedQuantity.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card>
                );
              })}
            </section>
          ) : null}

          {showAllocationConfirmation && allocationMode ? (
            <Card className="space-y-3 border-[var(--erp-brand)]" role="alert">
              <p className="text-sm text-slate-700">
                {allocationMode === "GENERAL"
                  ? "Confirm that available General Stock should move into allocated stock against the linked booking IDs."
                  : "Confirm that all remaining booking quantities should be assigned to the selected work orders."}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isAllocating}
                  onClick={() => setShowAllocationConfirmation(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isAllocating}
                  onClick={() => void submitSalesOrderAllocation()}
                >
                  {isAllocating ? "Allocating..." : "Confirm and Allocate"}
                </Button>
              </div>
            </Card>
          ) : null}

          <footer className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeAutoAllocation} disabled={isAllocating}>
              Close
            </Button>
            {allocationMode === "GENERAL" ? (
              <Button
                type="button"
                disabled={
                  !allocationData ||
                  allocationLoading ||
                  isAllocating ||
                  !allocationData.orders.some((order) =>
                    order.sizes.some((size) => size.allocatableQuantity > 0 && size.generalStockQuantity > 0))
                }
                onClick={() => {
                  setAllocationError("");
                  setShowAllocationConfirmation(true);
                }}
              >
                Auto Allocate General Stock
              </Button>
            ) : null}
            {allocationMode === "PRODUCTION" ? (
              <Button
                type="button"
                disabled={
                  !allocationData ||
                  allocationLoading ||
                  isAllocating ||
                  !allocationData.orders.some((order) => order.totalUnassigned > 0) ||
                  allocationData.orders.some((order) =>
                    order.totalUnassigned > 0 &&
                    !order.workOrders.some((workOrder) => workOrder.id === selectedWorkOrders[order.orderId]))
                }
                onClick={() => {
                  setAllocationError("");
                  setShowAllocationConfirmation(true);
                }}
              >
                Auto Allocate to Production
              </Button>
            ) : null}
          </footer>
        </div>
      </Modal>
    </div>
  );
}
