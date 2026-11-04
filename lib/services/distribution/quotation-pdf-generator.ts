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

export async function downloadDistributionQuotationPdf(data: DistributionQuotationPdfData) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const { quotation, quotationParty } = data;
  const document = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
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
  document.setFillColor(79, 70, 229);
  document.rect(0, 0, pageWidth, 8, "F");
  document.setFont("helvetica", "bold");
  document.setFontSize(15);
  document.setTextColor(15, 23, 42);
  document.text(display(quotationParty.name), margin, 19, { maxWidth: 95 });
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.setTextColor(71, 85, 105);
  const sellerMeta = [
    addressLines("billingAddress").join(", "),
    quotationParty.email,
    quotationParty.phone ? `Phone: ${quotationParty.phone}` : "",
    quotationParty.gstin ? `GSTIN: ${quotationParty.gstin}` : "",
  ].filter((line): line is string => Boolean(line));
  document.text(sellerMeta, margin, 25, { maxWidth: 95 });
  document.setFont("helvetica", "bold");
  document.setFontSize(17);
  document.setTextColor(79, 70, 229);
  document.text("QUOTATION", pageWidth - margin, 18, { align: "right", maxWidth: 95 });
  document.setFontSize(9);
  document.setTextColor(15, 23, 42);
  document.text(`No. ${display(quotation.quotationNo)}`, pageWidth - margin, 25, { align: "right" });
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.setTextColor(71, 85, 105);
  document.text(`Date: ${date(quotation.quotationDate)}`, pageWidth - margin, 30, { align: "right" });
  document.text(`Valid until: ${date(quotation.validUntil)}   |   ${display(quotation.status)}`, pageWidth - margin, 35, { align: "right" });

  const renderParty = (
    x: number,
    title: string,
    gstin: string | null,
    lines: string[],
  ) => {
    document.setDrawColor(226, 232, 240);
    document.setFillColor(248, 250, 252);
    document.roundedRect(x, 42, partyWidth, partyHeight, 1.5, 1.5, "FD");
    document.setFont("helvetica", "bold");
    document.setFontSize(8);
    document.setTextColor(79, 70, 229);
    document.text(title.toUpperCase(), x + 4, 48);
    document.setTextColor(15, 23, 42);
    document.setFontSize(10);
    document.text(display(quotationParty.name), x + 4, 54, { maxWidth: partyWidth - 8 });
    document.setFont("helvetica", "normal");
    document.setFontSize(6.5);
    document.setTextColor(71, 85, 105);
    const details = [
      ...(quotationParty.legalName && quotationParty.legalName !== quotationParty.name ? [quotationParty.legalName] : []),
      ...lines,
      ...(gstin ? [`GSTIN: ${gstin}`] : []),
      ...(quotationParty.registeredState ? [`State: ${quotationParty.registeredState}`] : []),
      ...(quotationParty.email ? [quotationParty.email] : []),
      ...(quotationParty.phone ? [`Phone: ${quotationParty.phone}`] : []),
    ];
    document.text(details.length ? details : ["Address and tax details not provided"], x + 4, 59, {
      maxWidth: partyWidth - 8,
      lineHeightFactor: 1.05,
    });
  };

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

  const tableStyles = {
    theme: "grid" as const,
    headStyles: { fillColor: [79, 70, 229] as [number, number, number], textColor: 255 as const, fontStyle: "bold" as const, fontSize: 7, cellPadding: 2 },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59] as [number, number, number], valign: "middle" as const },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    styles: { lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.2, overflow: "linebreak" as const },
  };
  document.setFont("helvetica", "bold");
  document.setFontSize(10);
  document.setTextColor(15, 23, 42);
  document.text("Quotation Items", margin, 97);
  const itemRows = quotation.lines.map((line) => [
    line.description + (line.brand || line.styleName ? `\n${[line.brand, line.styleName].filter(Boolean).join(" / ")}` : ""),
    line.bookingNo,
    line.orderNo,
    line.sizes.map((size) => `${size.size}: ${size.bookedQuantity}`).join(", ") || "-",
    String(line.quantity),
    money(line.unitPrice),
    money(line.lineTotal),
    money(line.taxAmount),
    money(line.totalAmount),
  ]);
  autoTable(document, {
    startY: 100,
    margin: { left: margin, right: margin, bottom: 18 },
    tableWidth: contentWidth,
    head: [["Item / Description", "Booking", "Order", "Size Breakdown", "Qty", "Unit Price", "Before Tax", "Tax", "Amount"]],
    body: itemRows.length ? itemRows : [["No item lines recorded", "-", "-", "-", "-", "-", "-", "-", "-"]],
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 16 },
      2: { cellWidth: 16 },
      3: { cellWidth: 31 },
      4: { cellWidth: 10, halign: "right" },
      5: { cellWidth: 19, halign: "right" },
      6: { cellWidth: 21, halign: "right" },
      7: { cellWidth: 17, halign: "right" },
      8: { cellWidth: 18, halign: "right" },
    },
  });
  let nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 112;
  autoTable(document, {
    startY: nextY + 4,
    margin: { left: pageWidth - margin - 82, right: margin, bottom: 18 },
    tableWidth: 82,
    body: [
      ["Total Quantity", String(quotation.totalQuantity)],
      ["Before Tax", money(quotation.subtotal)],
      ["Delivery Charge", money(quotation.deliveryCharge)],
      ["CGST", money(quotation.cgstAmount)],
      ["SGST", money(quotation.sgstAmount)],
      ["IGST", money(quotation.igstAmount)],
      ["VAT / Sales Tax", money(addMoneyAmounts(quotation.vatAmount, quotation.salesTaxAmount))],
      ["Total Tax", money(quotation.taxAmount)],
      ["Grand Total", money(quotation.grandTotal)],
    ],
    theme: "plain",
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 }, 1: { halign: "right", cellWidth: 32 } },
  });
  nextY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 22;
  if (quotation.notes.trim()) {
    document.setFont("helvetica", "bold");
    document.setFontSize(10);
    document.setTextColor(15, 23, 42);
    document.text("Terms & Conditions", margin, nextY + 8);
    autoTable(document, {
      startY: nextY + 11,
      margin: { left: margin, right: margin, bottom: 18 },
      tableWidth: contentWidth,
      body: [[quotation.notes]],
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 1, textColor: [71, 85, 105], overflow: "linebreak" },
    });
  }

  const pageCount = document.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    document.setPage(pageNumber);
    document.setDrawColor(226, 232, 240);
    document.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    document.setFont("helvetica", "normal");
    document.setFontSize(7);
    document.setTextColor(100, 116, 139);
    document.text(`Generated from Quotation ${quotation.quotationNo}`, margin, pageHeight - 8);
    document.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }
  const safeFilename = quotation.quotationNo.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "quotation";
  document.save(`Quotation-${safeFilename}.pdf`);
}
