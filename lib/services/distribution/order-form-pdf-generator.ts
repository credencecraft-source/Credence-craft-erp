export type OrderFormPdfPartyAddress = { lines: string[]; gstin: string | null } | null;

export type OrderFormPdfData = {
  orderForm: {
    id: string;
    orderFormNo: string;
    orderFormDate: string;
    customer: string;
    status: string;
    totalQuantity: number;
    hasQuotation: boolean;
    createdAt: string;
    lines: Array<{
      bookingNo: string;
      orderNo: string;
      brand: string;
      styleName: string;
      quantity: number;
      sizes: Array<{ size: string; bookedQuantity: number }>;
    }>;
  };
  seller: {
    name: string;
    email: string | null;
    phone: string | null;
    gstin: string | null;
    address: string;
  };
  buyer: {
    name: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    gstin: string | null;
    registeredState: string | null;
    billingAddress: OrderFormPdfPartyAddress;
    shippingAddress: OrderFormPdfPartyAddress;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isPartyAddress(value: unknown): value is OrderFormPdfPartyAddress {
  return value === null || (
    isRecord(value) &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === "string") &&
    isNullableString(value.gstin)
  );
}

export function isOrderFormPdfData(value: unknown): value is OrderFormPdfData {
  if (!isRecord(value) || !isRecord(value.orderForm) || !isRecord(value.seller) || !isRecord(value.buyer)) {
    return false;
  }
  const { orderForm, seller, buyer } = value;
  return typeof orderForm.id === "string" &&
    typeof orderForm.orderFormNo === "string" &&
    typeof orderForm.orderFormDate === "string" &&
    typeof orderForm.customer === "string" &&
    typeof orderForm.status === "string" &&
    typeof orderForm.totalQuantity === "number" &&
    typeof orderForm.hasQuotation === "boolean" &&
    typeof orderForm.createdAt === "string" &&
    Array.isArray(orderForm.lines) &&
    orderForm.lines.every((line) => isRecord(line) &&
      typeof line.bookingNo === "string" &&
      typeof line.orderNo === "string" &&
      typeof line.brand === "string" &&
      typeof line.styleName === "string" &&
      typeof line.quantity === "number" &&
      Array.isArray(line.sizes) &&
      line.sizes.every((size) =>
        isRecord(size) && typeof size.size === "string" && typeof size.bookedQuantity === "number",
      )) &&
    typeof seller.name === "string" &&
    typeof seller.address === "string" &&
    isNullableString(seller.email) &&
    isNullableString(seller.phone) &&
    isNullableString(seller.gstin) &&
    typeof buyer.name === "string" &&
    isNullableString(buyer.legalName) &&
    isNullableString(buyer.email) &&
    isNullableString(buyer.phone) &&
    isNullableString(buyer.gstin) &&
    isNullableString(buyer.registeredState) &&
    isPartyAddress(buyer.billingAddress) &&
    isPartyAddress(buyer.shippingAddress);
}

export async function downloadOrderFormPdf(data: OrderFormPdfData) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const { orderForm, seller, buyer } = data;
  const document = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const partyGap = 6;
  const partyWidth = (contentWidth - partyGap) / 2;
  const display = (value: string | number | null | undefined) => {
    const clean = String(value ?? "").trim();
    return clean || "Not provided";
  };
  const date = (value: string) => {
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-IN");
  };
  const addressLines = (type: "billingAddress" | "shippingAddress") =>
    buyer[type]?.lines ?? buyer.billingAddress?.lines ?? buyer.shippingAddress?.lines ?? [];

  document.setProperties({ title: `Order Form ${orderForm.orderFormNo}`, subject: "Advance Booking Order Form" });
  document.setFillColor(79, 70, 229);
  document.rect(0, 0, pageWidth, 8, "F");
  document.setFont("helvetica", "bold");
  document.setFontSize(15);
  document.setTextColor(15, 23, 42);
  document.text(display(seller.name), margin, 19, { maxWidth: 95 });
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.setTextColor(71, 85, 105);
  const sellerDetails = [
    seller.address,
    seller.email,
    seller.phone ? `Phone: ${seller.phone}` : "",
    seller.gstin ? `GSTIN: ${seller.gstin}` : "",
  ].filter((line): line is string => Boolean(line));
  document.text(sellerDetails, margin, 25, { maxWidth: 95 });
  document.setFont("helvetica", "bold");
  document.setFontSize(17);
  document.setTextColor(79, 70, 229);
  document.text("ORDER FORM", pageWidth - margin, 18, { align: "right", maxWidth: 95 });
  document.setFontSize(9);
  document.setTextColor(15, 23, 42);
  document.text(`No. ${display(orderForm.orderFormNo)}`, pageWidth - margin, 25, { align: "right" });
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.setTextColor(71, 85, 105);
  document.text(`Date: ${date(orderForm.orderFormDate)}`, pageWidth - margin, 30, { align: "right" });
  document.text(`Status: ${display(orderForm.status)}`, pageWidth - margin, 35, { align: "right" });

  const renderParty = (
    x: number,
    title: string,
    gstin: string | null,
    lines: string[],
  ) => {
    document.setDrawColor(226, 232, 240);
    document.setFillColor(248, 250, 252);
    document.roundedRect(x, 42, partyWidth, 48, 1.5, 1.5, "FD");
    document.setFont("helvetica", "bold");
    document.setFontSize(8);
    document.setTextColor(79, 70, 229);
    document.text(title.toUpperCase(), x + 4, 48);
    document.setTextColor(15, 23, 42);
    document.setFontSize(10);
    document.text(display(buyer.name), x + 4, 54, { maxWidth: partyWidth - 8 });
    document.setFont("helvetica", "normal");
    document.setFontSize(6.5);
    document.setTextColor(71, 85, 105);
    const details = [
      ...(buyer.legalName && buyer.legalName !== buyer.name ? [buyer.legalName] : []),
      ...lines,
      ...(gstin ? [`GSTIN: ${gstin}`] : []),
      ...(buyer.registeredState ? [`State: ${buyer.registeredState}`] : []),
      ...(buyer.email ? [buyer.email] : []),
      ...(buyer.phone ? [`Phone: ${buyer.phone}`] : []),
    ];
    document.text(details.length ? details : ["Address and tax details not provided"], x + 4, 59, {
      maxWidth: partyWidth - 8,
      lineHeightFactor: 1.05,
    });
  };

  renderParty(margin, "Bill To", buyer.billingAddress?.gstin ?? buyer.gstin, addressLines("billingAddress"));
  renderParty(
    margin + partyWidth + partyGap,
    "Ship To",
    buyer.shippingAddress?.gstin ?? buyer.gstin,
    addressLines("shippingAddress"),
  );

  document.setFont("helvetica", "bold");
  document.setFontSize(10);
  document.setTextColor(15, 23, 42);
  document.text("Order Form Items", margin, 99);
  const tableStyles = {
    theme: "grid" as const,
    headStyles: { fillColor: [79, 70, 229] as [number, number, number], textColor: 255 as const, fontStyle: "bold" as const, fontSize: 7, cellPadding: 2 },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59] as [number, number, number], valign: "middle" as const },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    styles: { lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.2, overflow: "linebreak" as const },
  };
  autoTable(document, {
    startY: 102,
    margin: { left: margin, right: margin, bottom: 18 },
    tableWidth: contentWidth,
    head: [["SL", "Booking No.", "Order No.", "Brand / Style", "Size Breakdown", "Qty (PCS)"]],
    body: orderForm.lines.length
      ? orderForm.lines.map((line, index) => [
          String(index + 1),
          line.bookingNo,
          line.orderNo,
          [line.brand, line.styleName].filter(Boolean).join(" / ") || "-",
          line.sizes.map((size) => `${size.size}: ${size.bookedQuantity}`).join(", ") || "-",
          String(line.quantity),
        ])
      : [["-", "-", "-", "No item lines recorded", "-", "-"]],
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 28 },
      3: { cellWidth: 42 },
      4: { cellWidth: 52 },
      5: { cellWidth: 26, halign: "right" },
    },
  });
  const finalY = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 114;
  autoTable(document, {
    startY: finalY + 6,
    margin: { left: pageWidth - margin - 72, right: margin, bottom: 18 },
    tableWidth: 72,
    body: [
      ["Total Lines", String(orderForm.lines.length)],
      ["Total Quantity", String(orderForm.totalQuantity)],
      ["Quotation Status", orderForm.hasQuotation ? "Created" : "Not Created"],
    ],
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 }, 1: { halign: "right", cellWidth: 30 } },
  });

  const pageCount = document.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    document.setPage(pageNumber);
    document.setDrawColor(226, 232, 240);
    document.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    document.setFont("helvetica", "normal");
    document.setFontSize(7);
    document.setTextColor(100, 116, 139);
    document.text(`Generated from Order Form ${orderForm.orderFormNo}`, margin, pageHeight - 8);
    document.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }
  const safeFilename = orderForm.orderFormNo.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "order-form";
  document.save(`Order-Form-${safeFilename}.pdf`);
}
