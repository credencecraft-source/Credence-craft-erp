"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";
import { ReportGrid } from "@/components/reports/report-grid-display";
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
  };
  children: SalesOrderPdfChild[];
  salesOrderDocument: {
    seller: { name: string; email: string | null; phone: string | null; gstin: string; address: string };
    buyer: SalesOrderPdfParty;
  };
};

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
  const requiredQuotationStrings = ["id", "quotationNo", "quotationDate", "validUntil", "orderNo", "customer", "notes", "status", "subtotal"];
  if (requiredQuotationStrings.some((key) => typeof quotation[key] !== "string") ||
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
  const [visibleFields, setVisibleFields] = useState<SalesOrderField[]>(fields.map(({ key }) => key));
  const [error, setError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
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

  const loadQuotations = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/distribution/quotations?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.quotations)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load sales orders.");
      }
      setQuotations(data.quotations as DistributionQuotationSummary[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load sales orders.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void Promise.resolve().then(loadQuotations);
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

  const salesOrders = useMemo<SalesOrderRow[]>(() => {
    const childCounts = new Map<string, number>();
    for (const quotation of quotations) {
      if (quotation.parentQuotationId) {
        childCounts.set(
          quotation.parentQuotationId,
          (childCounts.get(quotation.parentQuotationId) ?? 0) + 1,
        );
      }
    }
    return quotations
      .filter((quotation) => quotation.mode === "MASTER")
      .map((quotation) => ({
        ...quotation,
        childCount: childCounts.get(quotation.id) ?? 0,
      }));
  }, [quotations]);

  function openDetails(id: string) {
    router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/sales-order/${encodeURIComponent(id)}`);
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

  async function downloadSalesOrderPdf(order: SalesOrderRow) {
    if (pdfLoadingOrderId) return;
    setPdfLoadingOrderId(order.id);
    setPdfError("");
    try {
      const query = new URLSearchParams({ organizationId, mode: "MASTER_PDF" });
      const response = await fetch(`/api/distribution/quotations/${encodeURIComponent(order.id)}?${query}`, { cache: "no-store" });
      const responseData: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = isRecord(responseData) && typeof responseData.error === "string"
          ? responseData.error
          : "Unable to load Sales Order details for the PDF.";
        throw new Error(message);
      }
      if (!isSalesOrderPdfPayload(responseData)) {
        throw new Error("The Sales Order details returned an incomplete PDF document.");
      }

      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const document = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      const margin = 12;
      const contentWidth = pageWidth - margin * 2;
      const { quotation, children, salesOrderDocument } = responseData;
      const { seller } = salesOrderDocument;
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
        const amount = Number(value);
        return Number.isFinite(amount)
          ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)
          : value;
      };
      const safeFilename = quotation.quotationNo.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "sales-order";

      document.setProperties({ title: `Sales Order ${quotation.quotationNo}`, subject: "Sales Order and linked quotations" });
      const partyGap = 6;
      const partyWidth = (contentWidth - partyGap) / 2;
      const partyHeight = 39;
      const renderDocumentHeader = (title: string, number: string, dateText: string, statusText: string) => {
        document.setFillColor(79, 70, 229);
        document.rect(0, 0, pageWidth, 8, "F");
        document.setFont("helvetica", "bold");
        document.setFontSize(15);
        document.setTextColor(15, 23, 42);
        document.text(display(seller.name), margin, 19, { maxWidth: 95 });
        document.setFont("helvetica", "normal");
        document.setFontSize(8);
        document.setTextColor(71, 85, 105);
        const sellerMeta = [
          seller.address,
          seller.email,
          seller.phone ? `Phone: ${seller.phone}` : "",
          seller.gstin ? `GSTIN: ${seller.gstin}` : "",
        ].filter((line): line is string => Boolean(line));
        document.text(sellerMeta, margin, 25, { maxWidth: 95 });
        document.setFont("helvetica", "bold");
        document.setFontSize(17);
        document.setTextColor(79, 70, 229);
        document.text(title, pageWidth - margin, 18, { align: "right" });
        document.setFontSize(9);
        document.setTextColor(15, 23, 42);
        document.text(`No. ${display(number)}`, pageWidth - margin, 25, { align: "right" });
        document.setFont("helvetica", "normal");
        document.setFontSize(8);
        document.setTextColor(71, 85, 105);
        document.text(`Date: ${date(dateText)}`, pageWidth - margin, 30, { align: "right" });
        document.text(statusText, pageWidth - margin, 35, { align: "right" });
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
      ) => {
        document.setDrawColor(226, 232, 240);
        document.setFillColor(248, 250, 252);
        document.roundedRect(x, y, partyWidth, partyHeight, 1.5, 1.5, "FD");
        document.setFont("helvetica", "bold");
        document.setFontSize(8);
        document.setTextColor(79, 70, 229);
        document.text(title.toUpperCase(), x + 4, y + 6);
        document.setTextColor(15, 23, 42);
        document.setFontSize(10);
        document.text(display(name), x + 4, y + 12, { maxWidth: partyWidth - 8 });
        document.setFont("helvetica", "normal");
        document.setFontSize(7.5);
        document.setTextColor(71, 85, 105);
        const lines = [
          ...(legalName && legalName !== name ? [legalName] : []),
          ...addressLines,
          ...(email ? [email] : []),
          ...(phone ? [`Phone: ${phone}`] : []),
          ...(gstin ? [`GSTIN: ${gstin}`] : []),
          ...(state ? [`State: ${state}`] : []),
        ].slice(0, 4);
        document.text(lines.length ? lines : ["Address and tax details not provided"], x + 4, y + 17, {
          maxWidth: partyWidth - 8,
          lineHeightFactor: 1.2,
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
      const companyParty = {
        name: seller.name,
        legalName: null,
        email: seller.email,
        phone: seller.phone,
        gstin: seller.gstin || null,
        addressLines: seller.address ? [seller.address] : [],
        state: null,
      };
      const partyAddressLines = (party: SalesOrderPdfParty, type: "billingAddress" | "shippingAddress") =>
        party[type]?.lines ?? party.billingAddress?.lines ?? party.shippingAddress?.lines ?? [];
      const renderSectionTitle = (title: string, y: number) => {
        document.setFont("helvetica", "bold");
        document.setFontSize(10);
        document.setTextColor(15, 23, 42);
        document.text(title, margin, y);
      };
      const tableStyles = {
        theme: "grid" as const,
        headStyles: { fillColor: [79, 70, 229] as [number, number, number], textColor: 255 as const, fontStyle: "bold" as const, fontSize: 7, cellPadding: 2 },
        bodyStyles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59] as [number, number, number], valign: "middle" as const },
        alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
        styles: { lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.2, overflow: "linebreak" as const },
      };

      const quotationSummaryRows = children.map((child, index) => {
        const styles = new Set(child.lines.map((line) => {
          const style = line.styleName.trim() || line.description.trim();
          return `${line.brand.trim().toLocaleLowerCase()}|${style.toLocaleLowerCase()}`;
        }).filter((style) => style !== "|"));
        return [
          String(index + 1),
          child.quotationNo,
          child.quotationParty.name,
          String(child.totalQuantity),
          String(styles.size),
          money(child.subtotal),
          "Not recorded",
          "Not stored",
        ];
      });
      renderDocumentHeader("SALES ORDER", quotation.quotationNo, quotation.quotationDate, `Status: ${display(quotation.status)}`);
      const estimatedSummaryTableHeight = 11 + quotationSummaryRows.length * 8.5;
      autoTable(document, {
        startY: Math.max(42, (pageHeight - estimatedSummaryTableHeight) / 2),
        margin: { left: margin, right: margin, bottom: margin },
        tableWidth: contentWidth,
        head: [["SL", "Quotation No.", "Quotation Vendor", "No. of Pcs", "No. of Styles", "Total Value", "IGST", "GST Value"]],
        body: quotationSummaryRows.length
          ? quotationSummaryRows
          : [["-", "No linked quotations", "-", "-", "-", "-", "-", "-"]],
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fontSize: 6.5, cellPadding: 1.5 },
        bodyStyles: { ...tableStyles.bodyStyles, fontSize: 6.5, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 28 },
          2: { cellWidth: 36 },
          3: { cellWidth: 19, halign: "right" },
          4: { cellWidth: 20, halign: "right" },
          5: { cellWidth: 27, halign: "right" },
          6: { cellWidth: 23 },
          7: { cellWidth: 25 },
        },
      });

      for (const child of children) {
        document.addPage();
        renderDocumentHeader(
          "QUOTATION",
          child.quotationNo,
          child.quotationDate,
          `Valid until: ${date(child.validUntil)}   |   ${display(child.status)}`,
        );
        const quotationTo = child.quotationParty;
        const quotationToAddress = {
          name: quotationTo.name,
          legalName: quotationTo.legalName,
          email: quotationTo.email,
          phone: quotationTo.phone,
          gstin: quotationTo.billingAddress?.gstin ?? quotationTo.gstin,
          addressLines: partyAddressLines(quotationTo, "billingAddress"),
          state: quotationTo.registeredState,
        };
        renderPartyPair(43, "Quotation From", companyParty, "Quotation To", quotationToAddress);
        renderSectionTitle("Quotation Items", 91);
        const itemRows = child.lines.map((line) => [
          line.description + (line.brand || line.styleName ? `\n${[line.brand, line.styleName].filter(Boolean).join(" / ")}` : ""),
          line.bookingNo,
          line.orderNo,
          line.sizes.map((size) => `${size.size}: ${size.bookedQuantity}`).join(", ") || "-",
          String(line.quantity),
          money(line.unitPrice),
          money(line.lineTotal),
        ]);
        autoTable(document, {
          startY: 94,
          margin: { left: margin, right: margin, bottom: 18 },
          tableWidth: contentWidth,
          head: [["Item / Description", "Booking", "Order", "Size Breakdown", "Qty", "Unit Price", "Amount"]],
          body: itemRows.length ? itemRows : [["No item lines recorded", "-", "-", "-", "-", "-", "-"]],
          ...tableStyles,
          columnStyles: {
            0: { cellWidth: 48 },
            1: { cellWidth: 18 },
            2: { cellWidth: 18 },
            3: { cellWidth: 34 },
            4: { cellWidth: 12, halign: "right" },
            5: { cellWidth: 27, halign: "right" },
            6: { cellWidth: 29, halign: "right" },
          },
        });
        let nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 112;
        autoTable(document, {
          startY: nextY + 4,
          margin: { left: pageWidth - margin - 72, right: margin, bottom: 18 },
          tableWidth: 72,
          body: [
            ["Total Quantity", String(child.totalQuantity)],
            ["Subtotal", money(child.subtotal)],
          ],
          theme: "plain",
          styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 44 }, 1: { halign: "right", cellWidth: 28 } },
        });
        nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 22;
        renderSectionTitle("Tax Details", nextY + 8);
        document.setFont("helvetica", "normal");
        document.setFontSize(7.5);
        document.setTextColor(100, 116, 139);
        document.text(
          `GSTIN: ${display(quotationTo.billingAddress?.gstin ?? quotationTo.gstin)}. GST rates and amounts are not stored on this quotation and have not been calculated.`,
          margin,
          nextY + 14,
          { maxWidth: contentWidth },
        );
        if (child.notes.trim()) {
          renderSectionTitle("Terms & Conditions", nextY + 24);
          autoTable(document, {
            startY: nextY + 27,
            margin: { left: margin, right: margin, bottom: 18 },
            tableWidth: contentWidth,
            body: [[child.notes]],
            theme: "plain",
            styles: { fontSize: 8, cellPadding: 1, textColor: [71, 85, 105], overflow: "linebreak" },
          });
        }
      }

      const pageCount = document.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        document.setPage(pageNumber);
        document.setDrawColor(226, 232, 240);
        document.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
        document.setFont("helvetica", "normal");
        document.setFontSize(7);
        document.setTextColor(100, 116, 139);
        document.text(`Generated from Sales Order ${quotation.quotationNo}`, margin, pageHeight - 8);
        document.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
      }
      document.save(`Sales-Order-${safeFilename}.pdf`);
    } catch (pdfGenerationError) {
      setPdfError(pdfGenerationError instanceof Error ? pdfGenerationError.message : "Unable to create the Sales Order PDF.");
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
          selectedIds={[]}
          selectable={false}
          onRowClick={openDetails}
          onRowAction={openDetails}
          rowActionLabel="View Details"
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
                onClick={() => void downloadSalesOrderPdf(order)}
                disabled={pdfLoadingOrderId !== null}
              >
                {pdfLoadingOrderId === order.id ? "Preparing PDF..." : "Sales Order PDF"}
              </Button>
            </div>
          )}
          emptyMessage={isLoading ? "Loading sales orders..." : "No sales orders have been created."}
          renderCell={renderSalesOrderCell}
        />
      </Card>
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
