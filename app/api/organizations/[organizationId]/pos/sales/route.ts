import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import {
  createPosGeneralStockSale,
  isPosPurchaseRewardAvailable,
  type PosInvoiceShippingAddress,
} from "@/lib/services/pos/pos-general-stock-sale-service";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import type { PosStockHierarchy } from "@/lib/services/pos/pos-stock-location-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseShippingAddress(value: unknown): PosInvoiceShippingAddress | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Enter a valid shipping address.");
  }
  const record = value as Record<string, unknown>;
  const fields = [
    ["recipientName", 200],
    ["phone", 40],
    ["addressLine1", 200],
    ["city", 100],
    ["state", 100],
    ["postalCode", 20],
    ["countryCode", 2],
  ] as const;
  for (const [field, maximum] of fields) {
    if (typeof record[field] !== "string"
      || !record[field].trim()
      || record[field].trim().length > maximum) {
      throw new Error("Enter a valid shipping address.");
    }
  }
  if (record.addressLine2 !== undefined && record.addressLine2 !== null
    && (typeof record.addressLine2 !== "string" || record.addressLine2.trim().length > 200)) {
    throw new Error("Enter a valid shipping address.");
  }
  const countryCode = String(record.countryCode).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("Enter a valid shipping country code.");
  return {
    recipientName: String(record.recipientName).trim(),
    phone: String(record.phone).trim(),
    addressLine1: String(record.addressLine1).trim(),
    addressLine2: typeof record.addressLine2 === "string" ? record.addressLine2.trim() || null : null,
    city: String(record.city).trim(),
    state: String(record.state).trim(),
    postalCode: String(record.postalCode).trim(),
    countryCode,
  };
}

function offerSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.code !== "string"
    || typeof record.name !== "string"
    || typeof record.discountAmount !== "string"
  ) {
    return null;
  }
  return {
    code: record.code,
    name: record.name,
    discountAmount: record.discountAmount,
  };
}

function parseReturnCreditApplications(value: unknown) {
  if (value === undefined) return { applications: [], error: null };
  if (!Array.isArray(value) || value.length > 50) {
    return { applications: [], error: "Sales-return credits must be a list of no more than 50 entries." };
  }
  const applications: Array<{ returnId: string; amount: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { applications: [], error: "Each sales-return credit must include a return ID and decimal amount." };
    }
    const record = item as Record<string, unknown>;
    if (typeof record.returnId !== "string" || typeof record.amount !== "string") {
      return { applications: [], error: "Each sales-return credit must include a return ID and decimal amount." };
    }
    applications.push({ returnId: record.returnId, amount: record.amount });
  }
  return { applications, error: null };
}

function encodeInvoiceCursor(invoice: { id: string; posted_at: Date }) {
  return Buffer.from(JSON.stringify({
    id: invoice.id,
    postedAt: invoice.posted_at.toISOString(),
  })).toString("base64url");
}

function parseInvoiceCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      postedAt?: unknown;
    };
    if (
      typeof parsed.id !== "string" ||
      parsed.id.length === 0 ||
      parsed.id.length > 100 ||
      typeof parsed.postedAt !== "string"
    ) {
      return null;
    }
    const postedAt = new Date(parsed.postedAt);
    if (Number.isNaN(postedAt.getTime()) || postedAt.toISOString() !== parsed.postedAt) {
      return null;
    }
    return { id: parsed.id, postedAt };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    const searchParams = new URL(request.url).searchParams;
    const rewardEligibility = searchParams.get("rewardEligibility");
    if (rewardEligibility !== null) {
      if (rewardEligibility !== "true") {
        return NextResponse.json({ error: "Invalid purchase-reward eligibility request." }, { status: 400 });
      }
      const invoiceDate = searchParams.get("invoiceDate") ?? "";
      const subtotal = searchParams.get("subtotal") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(subtotal)) {
        return NextResponse.json({ error: "Purchase-reward eligibility details are invalid." }, { status: 400 });
      }
      const available = await isPosPurchaseRewardAvailable({
        organizationId: organization.id,
        invoiceDate,
        subtotal,
      });
      return NextResponse.json({ available });
    }
    const invoiceNumber = searchParams.get("invoiceNumber")?.trim();
    if (invoiceNumber) {
      const [invoice, issuer] = await Promise.all([
        prisma.posSalesInvoice.findFirst({
          where: { organization_id: organization.id, invoice_no: invoiceNumber },
          include: {
            lines: true,
            entity: { select: { entity_name: true } },
            couponRedemption: {
              select: {
                coupon_code: true,
                discount_amount: true,
                coupon: {
                  select: { name: true, discount_type: true, discount_value: true },
                },
              },
            },
            issuedCoupon: {
              select: {
                coupon_code: true,
                expires_at: true,
                coupon: {
                  select: { name: true, discount_type: true, discount_value: true },
                },
              },
            },
          },
        }),
        prisma.organization.findFirst({
          where: { id: organization.id },
          select: {
            organization_name: true,
            gst_number: true,
            address_line_1: true,
            address_line_2: true,
            city: true,
            state: true,
            pin_code: true,
          },
        }),
      ]);
      if (!invoice) {
        return NextResponse.json({ error: "POS invoice was not found." }, { status: 404 });
      }
      if (!issuer) {
        return NextResponse.json({ error: "POS invoice issuer details are unavailable." }, { status: 500 });
      }
      return NextResponse.json({
        invoices: [{
          invoiceNumber: invoice.invoice_no,
          invoiceDate: invoice.invoice_date.toISOString().slice(0, 10),
          customer: invoice.customer ?? "",
          entityName: invoice.entity?.entity_name ?? "",
          status: invoice.status,
          shippingAddress: invoice.shipping_address ?? null,
          appliedCouponCode: invoice.couponRedemption?.coupon_code ?? null,
          appliedCouponName: invoice.couponRedemption?.coupon.name ?? null,
          appliedCouponDiscountType: invoice.couponRedemption?.coupon.discount_type ?? null,
          appliedCouponDiscountValue: invoice.couponRedemption
            ? Number(invoice.couponRedemption.coupon.discount_value)
            : null,
          appliedCouponDiscountAmount: invoice.couponRedemption
            ? Number(invoice.couponRedemption.discount_amount)
            : null,
          couponDiscountAmount: Number(invoice.coupon_discount_amount),
          issuedCouponCode: invoice.issuedCoupon?.coupon_code ?? null,
          issuedCouponExpiresAt: invoice.issuedCoupon?.expires_at?.toISOString().slice(0, 10) ?? null,
          issuedCouponName: invoice.issuedCoupon?.coupon.name ?? null,
          issuedCouponDiscountType: invoice.issuedCoupon?.coupon.discount_type ?? null,
          issuedCouponDiscountValue: invoice.issuedCoupon
            ? Number(invoice.issuedCoupon.coupon.discount_value)
            : null,
          issuer: {
            name: issuer.organization_name,
            gstNumber: issuer.gst_number,
            address: [issuer.address_line_1, issuer.address_line_2, issuer.city, issuer.state, issuer.pin_code]
              .filter(Boolean)
              .join(", "),
          },
          lines: invoice.lines.map((line) => ({
            record: {
              id: line.sku_stock_id ?? line.general_stock_receipt_id ?? "",
              stock_type: line.sku_stock_id ? "SKU" : "GENERAL_GRN",
              style_name: line.style_name,
              order_no: line.order_no,
              article_no: line.article_no,
              size: line.size,
              colour: line.colour,
              hsn_code: line.hsn_code,
            },
            quantity: Number(line.quantity),
            rate: Number(line.unit_rate),
            gstRate: Number(line.gst_rate),
            discountPercent: Number(line.discount_percent),
            appliedOffer: offerSnapshot(line.offer_snapshot),
            amount: Number(line.taxable_amount),
            taxAmount: Number(line.cgst_amount) + Number(line.sgst_amount) + Number(line.igst_amount),
            totalAmount: Number(line.total_amount),
          })),
          subtotal: Number(invoice.subtotal),
          cgstAmount: Number(invoice.cgst_amount),
          sgstAmount: Number(invoice.sgst_amount),
          igstAmount: Number(invoice.igst_amount),
          taxRate: Number(invoice.subtotal) > 0 ? Number(invoice.tax_amount) / Number(invoice.subtotal) * 100 : 0,
          taxAmount: Number(invoice.tax_amount),
          grandTotal: Number(invoice.total_amount),
          storeCreditAppliedAmount: Number(invoice.store_credit_applied_amount ?? 0),
          amountDue: Number(invoice.total_amount) - Number(invoice.store_credit_applied_amount ?? 0),
          savedAt: invoice.posted_at.toISOString(),
        }],
      });
    }

    const search = searchParams.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Invoice search must contain 100 characters or fewer." }, { status: 400 });
    }
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawCursor = searchParams.get("cursor");
    const cursor = rawCursor ? parseInvoiceCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "Invalid invoice pagination cursor." }, { status: 400 });
    }

    const invoices = await prisma.posSalesInvoice.findMany({
      where: {
        organization_id: organization.id,
        ...(search ? {
          OR: [
            { invoice_no: { contains: search, mode: "insensitive" as const } },
            { customer: { contains: search, mode: "insensitive" as const } },
          ],
        } : {}),
        ...(cursor ? {
          AND: [{
            OR: [
              { posted_at: { lt: cursor.postedAt } },
              { posted_at: cursor.postedAt, id: { lt: cursor.id } },
            ],
          }],
        } : {}),
      },
      select: {
        id: true,
        invoice_no: true,
        invoice_date: true,
        customer: true,
        entity: { select: { entity_name: true } },
        couponRedemption: { select: { id: true } },
        issuedCoupon: { select: { id: true } },
        subtotal: true,
        coupon_discount_amount: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        tax_amount: true,
        total_amount: true,
        store_credit_applied_amount: true,
        posted_at: true,
      },
      orderBy: [{ posted_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = invoices.length > limit;
    const pageInvoices = invoices.slice(0, limit);
    return NextResponse.json({
      invoices: pageInvoices.map((invoice) => ({
        invoiceNumber: invoice.invoice_no,
        invoiceDate: invoice.invoice_date.toISOString().slice(0, 10),
        customer: invoice.customer ?? "",
        entityName: invoice.entity?.entity_name ?? "",
        hasCouponCode: Boolean(invoice.issuedCoupon || invoice.couponRedemption),
        lines: [],
        subtotal: Number(invoice.subtotal),
        couponDiscountAmount: Number(invoice.coupon_discount_amount),
        cgstAmount: Number(invoice.cgst_amount),
        sgstAmount: Number(invoice.sgst_amount),
        igstAmount: Number(invoice.igst_amount),
        taxRate: Number(invoice.subtotal) > 0 ? Number(invoice.tax_amount) / Number(invoice.subtotal) * 100 : 0,
        taxAmount: Number(invoice.tax_amount),
        grandTotal: Number(invoice.total_amount),
        storeCreditAppliedAmount: Number(invoice.store_credit_applied_amount ?? 0),
        amountDue: Number(invoice.total_amount) - Number(invoice.store_credit_applied_amount ?? 0),
        savedAt: invoice.posted_at.toISOString(),
      })),
      nextCursor: hasMore
        ? encodeInvoiceCursor(pageInvoices[pageInvoices.length - 1])
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load POS invoices." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    await requireOrganizationPermission(user.id, organization.id, "CREATE_POS_SALES");
    const body = await request.json() as Record<string, unknown>;
    const salesChannel = body.salesChannel === undefined ? "COUNTER" : body.salesChannel;
    if (salesChannel !== "COUNTER" && salesChannel !== "ONLINE_STORE") {
      return NextResponse.json({ error: "Select a valid POS sales channel." }, { status: 400 });
    }
    if (salesChannel === "COUNTER"
      && (typeof body.customerContactId !== "string" || !body.customerContactId.trim())) {
      return NextResponse.json({ error: "Select a registered customer before posting a POS invoice." }, { status: 400 });
    }
    let shippingAddress: PosInvoiceShippingAddress | null = null;
    try {
      shippingAddress = parseShippingAddress(body.shippingAddress);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Enter a valid shipping address." },
        { status: 400 },
      );
    }
    if (salesChannel === "ONLINE_STORE" && !shippingAddress) {
      return NextResponse.json({ error: "A shipping address is required for an online-store sale." }, { status: 400 });
    }
    if (!Array.isArray(body.lines)) {
      return NextResponse.json({ error: "Invoice lines are required." }, { status: 400 });
    }
    const lines = body.lines.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Each invoice line must be a valid object.");
      }
      const line = value as Record<string, unknown>;
      if (line.stockType !== undefined && line.stockType !== "SKU" && line.stockType !== "GENERAL_GRN") {
        throw new Error("Every invoice item must reference a supported General stock type.");
      }
      const stockType: "SKU" | "GENERAL_GRN" = line.stockType === "SKU" ? "SKU" : "GENERAL_GRN";
      if (line.offerId !== undefined && line.offerId !== null && typeof line.offerId !== "string") {
        throw new Error("Select a valid offer for this invoice item.");
      }
      return {
        stockId: typeof line.stockId === "string" ? line.stockId : "",
        stockType,
        quantity: String(line.quantity ?? ""),
        rate: String(line.rate ?? ""),
        gstRate: String(line.gstRate ?? ""),
        discountPercent: String(line.discountPercent ?? ""),
        hsnCode: typeof line.hsnCode === "string" ? line.hsnCode : null,
        offerId: typeof line.offerId === "string" ? line.offerId : null,
      };
    });
    const taxMode = body.taxMode === "INTERSTATE" ? "INTERSTATE" : body.taxMode === "LOCAL" ? "LOCAL" : null;
    if (!taxMode) return NextResponse.json({ error: "Select a valid tax mode." }, { status: 400 });
    if (body.customerContactId !== undefined && body.customerContactId !== null
      && typeof body.customerContactId !== "string") {
      return NextResponse.json({ error: "Select a valid customer contact." }, { status: 400 });
    }
    if (typeof body.entityId !== "string" || !body.entityId.trim()) {
      return NextResponse.json({ error: "Select an Entity before posting the invoice." }, { status: 400 });
    }
    let stockHierarchy: PosStockHierarchy | undefined;
    if (salesChannel === "COUNTER") {
      const hierarchy = body.stockHierarchy;
      if (!hierarchy || typeof hierarchy !== "object" || Array.isArray(hierarchy)) {
        return NextResponse.json({ error: "Select the complete stock hierarchy through a Sub-sub-location." }, { status: 400 });
      }
      const record = hierarchy as Record<string, unknown>;
      const fields = ["entityId", "divisionId", "locationId", "subLocationId", "subSubLocationId"] as const;
      if (fields.some((field) =>
        typeof record[field] !== "string"
        || !String(record[field]).trim()
        || String(record[field]).length > 128
      ) || record.entityId !== body.entityId) {
        return NextResponse.json({ error: "Select a valid complete stock hierarchy for the selected Entity." }, { status: 400 });
      }
      stockHierarchy = {
        entityId: record.entityId as string,
        divisionId: record.divisionId as string,
        locationId: record.locationId as string,
        subLocationId: record.subLocationId as string,
        subSubLocationId: record.subSubLocationId as string,
      };
    }
    if (body.couponCode !== undefined && body.couponCode !== null && typeof body.couponCode !== "string") {
      return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
    }
    const returnCreditParse = parseReturnCreditApplications(body.returnCreditApplications);
    if (returnCreditParse.error) {
      return NextResponse.json({ error: returnCreditParse.error }, { status: 400 });
    }

    const invoice = await createPosGeneralStockSale({
      organizationId: organization.id,
      actorId: user.id,
      requestKey: typeof body.requestKey === "string" ? body.requestKey : "",
      entityId: body.entityId,
      stockHierarchy,
      invoiceDate: String(body.invoiceDate ?? ""),
      customer: typeof body.customer === "string" ? body.customer : null,
      customerContactId: typeof body.customerContactId === "string" ? body.customerContactId : null,
      returnCreditApplications: returnCreditParse.applications,
      couponCode: typeof body.couponCode === "string" ? body.couponCode : null,
      salesChannel,
      shippingAddress,
      taxMode,
      lines,
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    const denied = error instanceof Error && error.message.startsWith("Access denied:");
    return NextResponse.json(
      { error: denied ? "You do not have permission to post POS sales." : error instanceof Error ? error.message : "Unable to post POS sale." },
      { status: denied ? 403 : error instanceof Error && "code" in error && error.code === "P2034" ? 409 : 400 },
    );
  }
}
