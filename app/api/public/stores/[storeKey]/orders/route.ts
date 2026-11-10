import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import {
  createPosGeneralStockSale,
  type PosInvoiceShippingAddress,
} from "@/lib/services/pos/pos-general-stock-sale-service";
import { findPublishedOnlineStore } from "@/lib/services/pos/public-online-store-service";

function parseShippingAddress(value: unknown): PosInvoiceShippingAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Enter a valid shipping address.");
  }
  const address = value as Record<string, unknown>;
  const fields = [
    ["recipientName", 200],
    ["phone", 40],
    ["addressLine1", 200],
    ["city", 100],
    ["state", 100],
    ["postalCode", 20],
  ] as const;
  for (const [field, maximum] of fields) {
    if (
      typeof address[field] !== "string"
      || !address[field].trim()
      || address[field].trim().length > maximum
    ) {
      throw new Error("Enter a valid shipping address.");
    }
  }
  if (
    address.addressLine2 !== undefined
    && address.addressLine2 !== null
    && (typeof address.addressLine2 !== "string" || address.addressLine2.trim().length > 200)
  ) {
    throw new Error("Enter a valid shipping address.");
  }
  return {
    recipientName: address.recipientName as string,
    phone: address.phone as string,
    addressLine1: address.addressLine1 as string,
    addressLine2: typeof address.addressLine2 === "string" ? address.addressLine2 : null,
    city: address.city as string,
    state: address.state as string,
    postalCode: address.postalCode as string,
    countryCode: "IN",
  };
}

function isSameOriginJsonRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin
      && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json";
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ storeKey: string }> },
) {
  if (!isSameOriginJsonRequest(request)) {
    return NextResponse.json({ error: "This checkout request is not allowed." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 64000) {
    return NextResponse.json({ error: "This order is too large to submit." }, { status: 413 });
  }

  try {
    const { storeKey } = await context.params;
    const store = await findPublishedOnlineStore(storeKey);
    if (!store) return NextResponse.json({ error: "This store is not available." }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const entityId = typeof body.entityId === "string" ? body.entityId.trim() : "";
    const requestKey = typeof body.requestKey === "string" ? body.requestKey.trim() : "";
    if (!entityId || entityId.length > 100) {
      return NextResponse.json({ error: "Select a valid store location." }, { status: 400 });
    }
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestKey)) {
      return NextResponse.json({ error: "Refresh checkout and try again." }, { status: 400 });
    }
    if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 30) {
      return NextResponse.json({ error: "An order must contain between 1 and 30 items." }, { status: 400 });
    }
    const shippingAddress = parseShippingAddress(body.shippingAddress);
    const lines = body.lines.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Every order item must be valid.");
      }
      const line = value as Record<string, unknown>;
      return {
        stockId: typeof line.stockId === "string" ? line.stockId : "",
        stockType: "SKU" as const,
        quantity: String(line.quantity ?? ""),
        rate: "0",
        gstRate: "0",
        discountPercent: "0",
      };
    });
    const activeEntity = await prisma.masterEntity.findFirst({
      where: { id: entityId, organization_id: store.id, is_active: true },
      select: { id: true },
    });
    if (!activeEntity) {
      return NextResponse.json({ error: "Select an active store location." }, { status: 400 });
    }

    const invoice = await createPosGeneralStockSale({
      organizationId: store.id,
      actorId: null,
      requestKey,
      entityId,
      invoiceDate: new Date().toISOString().slice(0, 10),
      customer: shippingAddress.recipientName,
      salesChannel: "ONLINE_STORE",
      shippingAddress,
      taxMode: "LOCAL",
      lines,
    });
    return NextResponse.json({ invoice: { invoiceNo: invoice.invoiceNo } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to place this order." },
      { status: 400 },
    );
  }
}
