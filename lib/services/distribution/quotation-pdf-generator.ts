import {
  DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
  type OrganizationPrintTemplateDesign,
} from "./organization-print-template-contract";

export type DistributionQuotationPdfAddress = { lines: string[]; gstin: string | null } | null;

export type DistributionQuotationPdfParty = {
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  registeredState: string | null;
  billingAddress: DistributionQuotationPdfAddress;
  shippingAddress: DistributionQuotationPdfAddress;
};

export type DistributionQuotationPdfData = {
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
    lines: Array<{
      description: string;
      brand: string;
      styleName: string;
      bookingNo: string;
      orderNo: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
      taxAmount: string;
      totalAmount: string;
      sizes: Array<{ size: string; bookedQuantity: number }>;
    }>;
  };
  quotationParty: DistributionQuotationPdfParty;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isMoneyAmount(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,16}\.\d{2}$/.test(value);
}

function isUnitPrice(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,16}\.\d{4}$/.test(value);
}

function isAddress(value: unknown): value is DistributionQuotationPdfAddress {
  return value === null || (
    isRecord(value) &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === "string") &&
    isNullableString(value.gstin)
  );
}

export function isDistributionQuotationPdfData(value: unknown): value is DistributionQuotationPdfData {
  if (!isRecord(value) || !isRecord(value.quotation) || !isRecord(value.quotationParty)) return false;
  const { quotation, quotationParty } = value;
  const quotationStrings = [
    "id", "quotationNo", "quotationDate", "validUntil", "orderNo", "customer", "notes", "status",
  ];
  const quotationAmounts = [
    "subtotal", "deliveryCharge", "cgstAmount", "sgstAmount", "igstAmount",
    "vatAmount", "salesTaxAmount", "taxAmount", "grandTotal",
  ];
  if (
    quotationStrings.some((key) => typeof quotation[key] !== "string") ||
    quotationAmounts.some((key) => !isMoneyAmount(quotation[key])) ||
    typeof quotation.totalQuantity !== "number" ||
    typeof quotationParty.name !== "string" ||
    !isNullableString(quotationParty.legalName) ||
    !isNullableString(quotationParty.email) ||
    !isNullableString(quotationParty.phone) ||
    !isNullableString(quotationParty.gstin) ||
    !isNullableString(quotationParty.registeredState) ||
    !isAddress(quotationParty.billingAddress) ||
    !isAddress(quotationParty.shippingAddress) ||
    !Array.isArray(quotation.lines)
  ) return false;

  return quotation.lines.every((line) => isRecord(line) &&
    typeof line.description === "string" &&
    typeof line.brand === "string" &&
    typeof line.styleName === "string" &&
    typeof line.bookingNo === "string" &&
    typeof line.orderNo === "string" &&
    typeof line.quantity === "number" &&
    isUnitPrice(line.unitPrice) &&
    isMoneyAmount(line.lineTotal) &&
    isMoneyAmount(line.taxAmount) &&
    isMoneyAmount(line.totalAmount) &&
    Array.isArray(line.sizes) &&
    line.sizes.every((size) =>
      isRecord(size) && typeof size.size === "string" && typeof size.bookedQuantity === "number",
    ));
}

function addMoneyAmounts(...values: string[]) {
  const total = values.reduce((sum, value) => {
    if (!isMoneyAmount(value)) throw new Error("Quotation tax totals contained invalid monetary data.");
    const [whole, fraction = ""] = value.split(".");
    return sum + BigInt(whole) * BigInt(100) + BigInt(fraction);
  }, BigInt(0));
  return `${total / BigInt(100)}.${String(total % BigInt(100)).padStart(2, "0")}`;
}

function hexToRgb(hexColor: string): [number, number, number] {
  const value = hexColor.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export async function createDistributionQuotationPdf(
  data: DistributionQuotationPdfData,
  templateDesign: OrganizationPrintTemplateDesign = DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const { quotation, quotationParty } = data;
  const document = new jsPDF({
    orientation: templateDesign.orientation.toLowerCase() as "portrait" | "landscape",
    unit: "mm",
    format: templateDesign.pageSize.toLowerCase(),
  });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = templateDesign.margins.left;
  const rightMargin = templateDesign.margins.right;
  const bottomMargin = templateDesign.margins.bottom;
  const topOffset = templateDesign.margins.top - 12;
  const contentWidth = pageWidth - margin - rightMargin;
  const fontFamily = templateDesign.fontFamily;
  const accentColor = hexToRgb(templateDesign.accentColor);
  const textColor = hexToRgb(templateDesign.textColor);
  const tableHeaderColor = hexToRgb(templateDesign.tableHeaderColor);
  const tableHeaderTextColor = hexToRgb(templateDesign.tableHeaderTextColor);
  const headerFields = new Set(templateDesign.sections.headerFields);
  const headerLines = templateDesign.headerText
    ? document.splitTextToSize(templateDesign.headerText, contentWidth)
    : [];
  const headerOffset = Math.min(headerLines.length * 3, 24);
  const partyGap = 6;
  const partyWidth = (contentWidth - partyGap) / 2;
  const partyHeight = 48;
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
    const groupedWhole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(BigInt(whole));
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
  const addressLines = (type: "billingAddress" | "shippingAddress") =>
    quotationParty[type]?.lines ?? quotationParty.billingAddress?.lines ?? quotationParty.shippingAddress?.lines ?? [];

  document.setProperties({ title: `Quotation ${quotation.quotationNo}`, subject: "Quotation" });
  document.setFillColor(...accentColor);
  document.rect(0, 0, pageWidth, 8, "F");
  const hasLogo = headerFields.has("companyLogo") && Boolean(templateDesign.logoDataUrl);
  if (hasLogo) {
    document.addImage(
      templateDesign.logoDataUrl,
      templateDesign.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG",
      margin,
      10,
      16,
      12,
    );
  }
  const companyX = margin + (hasLogo ? 20 : 0);
  if (headerFields.has("companyName")) {
    document.setFont(fontFamily, "bold");
    document.setFontSize(templateDesign.headingFontSize);
    document.setTextColor(...textColor);
    document.text(display(quotationParty.name), companyX, 19, { maxWidth: 75 });
    document.setFont(fontFamily, "normal");
    document.setFontSize(templateDesign.bodyFontSize);
    document.setTextColor(71, 85, 105);
    const sellerMeta = [
      addressLines("billingAddress").join(", "),
      quotationParty.email,
      quotationParty.phone ? `Phone: ${quotationParty.phone}` : "",
      quotationParty.gstin ? `GSTIN: ${quotationParty.gstin}` : "",
    ].filter((line): line is string => Boolean(line));
    document.text(sellerMeta, companyX, 25, { maxWidth: 75 });
  }
  document.setFont(fontFamily, "bold");
  document.setFontSize(templateDesign.headingFontSize + 2);
  document.setTextColor(...accentColor);
  document.text("QUOTATION", pageWidth - rightMargin, 18, { align: "right", maxWidth: 95 });
  if (headerFields.has("documentNumber")) {
    document.setFontSize(templateDesign.bodyFontSize + 1);
    document.setTextColor(...textColor);
    document.text(`No. ${display(quotation.quotationNo)}`, pageWidth - rightMargin, 25, { align: "right" });
  }
  if (headerFields.has("documentDate") || headerFields.has("status")) {
    document.setFont(fontFamily, "normal");
    document.setFontSize(templateDesign.bodyFontSize);
    document.setTextColor(71, 85, 105);
    if (headerFields.has("documentDate")) {
      document.text(`Date: ${date(quotation.quotationDate)}`, pageWidth - rightMargin, 30, { align: "right" });
    }
    if (headerFields.has("status")) {
      document.text(
        `Valid until: ${date(quotation.validUntil)}   |   ${display(quotation.status)}`,
        pageWidth - rightMargin,
        headerFields.has("documentDate") ? 35 : 30,
        { align: "right" },
      );
    }
  }
  if (headerLines.length) {
    document.setTextColor(...textColor);
    document.text(headerLines, pageWidth / 2, 40, { align: "center", maxWidth: contentWidth });
  }

  const renderParty = (
    x: number,
    title: string,
    gstin: string | null,
    lines: string[],
    width = partyWidth,
  ) => {
    document.setDrawColor(226, 232, 240);
    document.setFillColor(248, 250, 252);
    const partyY = 42 + topOffset + headerOffset;
    document.roundedRect(x, partyY, width, partyHeight, 1.5, 1.5, "FD");
    document.setFont(fontFamily, "bold");
    document.setFontSize(Math.max(templateDesign.bodyFontSize, 6));
    document.setTextColor(...accentColor);
    document.text(title.toUpperCase(), x + 4, partyY + 6);
    document.setTextColor(...textColor);
    document.setFontSize(templateDesign.bodyFontSize + 2);
    document.text(display(quotationParty.name), x + 4, partyY + 12, { maxWidth: width - 8 });
    document.setFont(fontFamily, "normal");
    document.setFontSize(Math.max(templateDesign.bodyFontSize - 1.5, 6));
    document.setTextColor(71, 85, 105);
    const details = [
      ...(quotationParty.legalName && quotationParty.legalName !== quotationParty.name ? [quotationParty.legalName] : []),
      ...lines,
      ...(gstin ? [`GSTIN: ${gstin}`] : []),
      ...(quotationParty.registeredState ? [`State: ${quotationParty.registeredState}`] : []),
      ...(quotationParty.email ? [quotationParty.email] : []),
      ...(quotationParty.phone ? [`Phone: ${quotationParty.phone}`] : []),
    ];
    document.text(details.length ? details : ["Address and tax details not provided"], x + 4, partyY + 17, {
      maxWidth: width - 8,
      lineHeightFactor: 1.05,
    });
  };

  const showBillTo = headerFields.has("billTo");
  const showShipTo = headerFields.has("shipTo");
  if (showBillTo && showShipTo) {
    renderParty(
      margin,
      "Bill To",
      quotationParty.billingAddress?.gstin ?? quotationParty.gstin,
      addressLines("billingAddress"),
    );
    renderParty(
      margin + partyWidth + partyGap,
      "Ship To",
      quotationParty.shippingAddress?.gstin ?? quotationParty.gstin,
      addressLines("shippingAddress"),
    );
  } else if (showBillTo) {
    renderParty(
      margin,
      "Bill To",
      quotationParty.billingAddress?.gstin ?? quotationParty.gstin,
      addressLines("billingAddress"),
      contentWidth,
    );
  } else if (showShipTo) {
    renderParty(
      margin,
      "Ship To",
      quotationParty.shippingAddress?.gstin ?? quotationParty.gstin,
      addressLines("shippingAddress"),
      contentWidth,
    );
  }

  const tableStyles = {
    theme: "grid" as const,
    headStyles: { fillColor: tableHeaderColor, textColor: tableHeaderTextColor, fontStyle: "bold" as const, fontSize: templateDesign.bodyFontSize, cellPadding: 2 },
    bodyStyles: { fontSize: templateDesign.bodyFontSize, cellPadding: 2, textColor, valign: "middle" as const },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    styles: { font: fontFamily, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.2, overflow: "linebreak" as const },
  };
  document.setFont(fontFamily, "bold");
  document.setFontSize(templateDesign.bodyFontSize + 2);
  document.setTextColor(...textColor);
  const itemTableY = 100 + topOffset + headerOffset;
  document.text("Quotation Items", margin, itemTableY - 3);
  const itemColumns = [
    { key: "description", label: "Item / Description", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => line.description + (line.brand || line.styleName ? `\n${[line.brand, line.styleName].filter(Boolean).join(" / ")}` : "") },
    { key: "booking", label: "Booking", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => line.bookingNo },
    { key: "order", label: "Order", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => line.orderNo },
    { key: "sizeBreakdown", label: "Size Breakdown", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => line.sizes.map((size) => `${size.size}: ${size.bookedQuantity}`).join(", ") || "-" },
    { key: "quantity", label: "Qty", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => String(line.quantity) },
    { key: "unitPrice", label: "Unit Price", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => money(line.unitPrice) },
    { key: "beforeTax", label: "Before Tax", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => money(line.lineTotal) },
    { key: "tax", label: "Tax", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => money(line.taxAmount) },
    { key: "amount", label: "Amount", value: (line: DistributionQuotationPdfData["quotation"]["lines"][number]) => money(line.totalAmount) },
  ].filter((column) => templateDesign.sections.itemFields.includes(column.key));
  const itemRows = quotation.lines.map((line) => itemColumns.map((column) => column.value(line)));
  autoTable(document, {
    startY: itemTableY,
    margin: { left: margin, right: rightMargin, bottom: bottomMargin },
    tableWidth: contentWidth,
    head: [itemColumns.map((column) => column.label)],
    body: itemRows.length ? itemRows : [itemColumns.map((_, index) => index === 0 ? "No item lines recorded" : "-")],
    ...tableStyles,
  });
  let nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 112;
  const summaryRows: Array<[string, string]> = [
    ["totalQuantity", "Total Quantity", String(quotation.totalQuantity)],
    ["beforeTax", "Before Tax", money(quotation.subtotal)],
    ["deliveryCharge", "Delivery Charge", money(quotation.deliveryCharge)],
    ["cgst", "CGST", money(quotation.cgstAmount)],
    ["sgst", "SGST", money(quotation.sgstAmount)],
    ["igst", "IGST", money(quotation.igstAmount)],
    ["vatSalesTax", "VAT / Sales Tax", money(addMoneyAmounts(quotation.vatAmount, quotation.salesTaxAmount))],
    ["totalTax", "Total Tax", money(quotation.taxAmount)],
    ["grandTotal", "Grand Total", money(quotation.grandTotal)],
  ].filter(([key]) => templateDesign.sections.summaryFields.includes(key))
    .map(([, label, amount]) => [label, amount]);
  if (summaryRows.length > 0) {
    autoTable(document, {
    startY: nextY + 4,
    margin: { left: pageWidth - rightMargin - Math.min(82, contentWidth), right: rightMargin, bottom: bottomMargin },
    tableWidth: Math.min(82, contentWidth),
    body: summaryRows,
    theme: "plain",
    styles: { font: fontFamily, fontSize: templateDesign.bodyFontSize, cellPadding: 1.5, textColor, lineColor: [226, 232, 240], lineWidth: 0.2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: Math.min(50, contentWidth * 50 / 82) },
      1: { halign: "right", cellWidth: Math.min(32, contentWidth * 32 / 82) },
    },
    });
    nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 22;
  }
  if (templateDesign.sections.showPaymentTerms && templateDesign.sections.paymentTermsText.trim()) {
    document.setFont(fontFamily, "bold");
    document.setFontSize(templateDesign.bodyFontSize + 2);
    document.setTextColor(...textColor);
    document.text("Payment Terms", margin, nextY + 8);
    autoTable(document, {
      startY: nextY + 11,
      margin: { left: margin, right: rightMargin, bottom: bottomMargin },
      tableWidth: contentWidth,
      body: [[templateDesign.sections.paymentTermsText]],
      theme: "plain",
      styles: { font: fontFamily, fontSize: templateDesign.bodyFontSize, cellPadding: 1, textColor, overflow: "linebreak" },
    });
    nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 18;
  }
  const specialNotes = [
    ...(templateDesign.sections.showSpecialNotes && quotation.notes.trim() ? [quotation.notes] : []),
    ...(templateDesign.sections.showSpecialNotes && templateDesign.footerText.trim() ? [templateDesign.footerText] : []),
  ];
  if (specialNotes.length > 0) {
    document.setFont(fontFamily, "bold");
    document.setFontSize(templateDesign.bodyFontSize + 2);
    document.setTextColor(...textColor);
    document.text("Special Notes", margin, nextY + 8);
    autoTable(document, {
      startY: nextY + 11,
      margin: { left: margin, right: rightMargin, bottom: bottomMargin },
      tableWidth: contentWidth,
      body: [[specialNotes.join("\n\n")]],
      theme: "plain",
      styles: { font: fontFamily, fontSize: templateDesign.bodyFontSize, cellPadding: 1, textColor, overflow: "linebreak" },
    });
  }

  const pageCount = document.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    document.setPage(pageNumber);
    document.setDrawColor(226, 232, 240);
    const footerY = pageHeight - Math.max(bottomMargin / 2, 5);
    document.line(margin, footerY - 4, pageWidth - rightMargin, footerY - 4);
    document.setFont(fontFamily, "normal");
    document.setFontSize(Math.max(templateDesign.bodyFontSize - 1, 6));
    document.setTextColor(100, 116, 139);
    document.text(
      `Generated from Quotation ${quotation.quotationNo}`,
      margin,
      footerY,
    );
    if (templateDesign.showPageNumbers) {
      document.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - rightMargin, footerY, { align: "right" });
    }
  }
  return document.output("blob");
}
