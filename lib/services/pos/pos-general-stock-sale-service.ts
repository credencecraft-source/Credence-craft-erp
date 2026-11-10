import { randomBytes } from "node:crypto";
import {
  FGMaterialIssueMovement,
  FGMaterialIssueSource,
  FGMaterialIssueStockType,
  PosCouponDiscountType,
  PosCouponIssueStatus,
  PosCouponStatus,
  PosCouponType,
  PosOfferScope,
  PosOfferStatus,
  PosOfferType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createFgMaterialIssue } from "@/lib/services/inventory/fg-issued-service";
import { GENERAL_FINISHED_GOODS_SKU_SOURCES } from "@/lib/services/inventory/finished-goods-stock-overview";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

type PosSaleLineInput = {
  stockId: string;
  stockType?: "SKU" | "GENERAL_GRN";
  quantity: string;
  rate: string;
  gstRate: string;
  discountPercent: string;
  hsnCode?: string | null;
  offerId?: string | null;
};

export type PosInvoiceShippingAddress = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
};

type CreatePosSaleInput = {
  organizationId: string;
  actorId: string | null;
  requestKey: string;
  entityId: string;
  invoiceDate: string;
  customer?: string | null;
  customerContactId?: string | null;
  couponCode?: string | null;
  salesChannel?: "COUNTER" | "ONLINE_STORE";
  shippingAddress?: PosInvoiceShippingAddress | null;
  taxMode: "LOCAL" | "INTERSTATE";
  lines: PosSaleLineInput[];
};

type PosSaleStockRecord = {
  id: string;
  entity_id: string;
  stockType: "SKU" | "GENERAL_GRN";
  style_name: string;
  order_no: string;
  article_no: string | null;
  size: string | null;
  colour: string | null;
  product_category: string | null;
  sub_product_category: string | null;
  location_id: string;
  current_stock: number | Prisma.Decimal;
  sales_price?: number | Prisma.Decimal | null;
  mrp?: number | Prisma.Decimal | null;
  gst_rate?: number | Prisma.Decimal | null;
  hsn_code?: string | null;
};

const POS_SALE_OFFER_INCLUDE = {
  targets: {
    select: {
      category: { select: { category_name: true } },
      color: { select: { colors: true } },
      size: { select: { size: true } },
    },
  },
} satisfies Prisma.PosOfferInclude;

type PosSaleOffer = Prisma.PosOfferGetPayload<{ include: typeof POS_SALE_OFFER_INCLUDE }>;

function stockKey(stockType: "SKU" | "GENERAL_GRN", stockId: string) {
  return `${stockType}:${stockId}`;
}

function normalizedLabel(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase() ?? "";
}

function offerMatchesStock(offer: PosSaleOffer, stock: PosSaleStockRecord) {
  if (offer.scope === PosOfferScope.ALL) return true;
  const targets = offer.targets;
  if (offer.scope === PosOfferScope.CATEGORY) {
    const categories = new Set(
      [stock.product_category, stock.sub_product_category]
        .map(normalizedLabel)
        .filter(Boolean),
    );
    return targets.some((target) =>
      target.category && categories.has(normalizedLabel(target.category.category_name)),
    );
  }
  if (offer.scope === PosOfferScope.COLOUR) {
    const colour = normalizedLabel(stock.colour);
    return Boolean(colour) && targets.some((target) =>
      target.color && normalizedLabel(target.color.colors) === colour,
    );
  }
  const size = normalizedLabel(stock.size);
  return Boolean(size) && targets.some((target) =>
    target.size && normalizedLabel(target.size.size) === size,
  );
}

function calculateOfferDiscount(
  offer: PosSaleOffer | null,
  line: { quantity: number; rate: Prisma.Decimal; discountPercent: Prisma.Decimal },
  amountAfterManualDiscount: Prisma.Decimal,
) {
  if (!offer) return new Prisma.Decimal(0);
  let discount = new Prisma.Decimal(0);
  switch (offer.offer_type) {
    case PosOfferType.FLAT_AMOUNT:
      discount = new Prisma.Decimal(line.quantity).mul(offer.discount_amount ?? 0);
      break;
    case PosOfferType.PERCENTAGE:
      discount = amountAfterManualDiscount.mul(offer.discount_percentage ?? 0).div(100);
      break;
    case PosOfferType.BUY_ONE_GET_ONE: {
      const requiredQuantity = (offer.buy_quantity ?? 0) + (offer.get_quantity ?? 0);
      if (requiredQuantity < 1 || line.quantity < requiredQuantity) {
        throw new Error(`${offer.offer_code} requires at least ${requiredQuantity} units on this invoice line.`);
      }
      const discountedQuantity = Math.floor(line.quantity / requiredQuantity) * (offer.get_quantity ?? 0);
      discount = amountAfterManualDiscount
        .mul(discountedQuantity)
        .div(line.quantity)
        .mul(offer.get_discount_percentage ?? 0)
        .div(100);
      break;
    }
    case PosOfferType.COMBO:
      throw new Error("Combo offers cannot be applied to a single invoice line.");
  }
  return money(Prisma.Decimal.min(amountAfterManualDiscount, discount));
}

function serializeOfferSnapshot(offer: PosSaleOffer, discountAmount: Prisma.Decimal) {
  return {
    id: offer.id,
    code: offer.offer_code,
    name: offer.name,
    type: offer.offer_type,
    scope: offer.scope,
    discountAmount: discountAmount.toFixed(2),
    discountValue: {
      amount: offer.discount_amount?.toFixed(2) ?? null,
      percentage: offer.discount_percentage?.toFixed(2) ?? null,
      buyQuantity: offer.buy_quantity,
      getQuantity: offer.get_quantity,
      getDiscountPercentage: offer.get_discount_percentage?.toFixed(2) ?? null,
    },
  } satisfies Prisma.InputJsonObject;
}

function parseDecimal(value: string, field: string, scale: number, maximum?: number) {
  const pattern = scale === 0
    ? /^\d{1,10}$/
    : new RegExp(`^\\d{1,10}(?:\\.\\d{1,${scale}})?$`);
  if (!pattern.test(value.trim())) throw new Error(`${field} must be a valid non-negative number.`);
  const parsed = new Prisma.Decimal(value.trim());
  if (!parsed.isFinite() || (maximum !== undefined && parsed.gt(maximum))) {
    throw new Error(`${field} is outside the allowed range.`);
  }
  return parsed;
}

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function assertMoneyRange(value: Prisma.Decimal, field: string) {
  if (value.gt("999999999999.99")) throw new Error(`${field} exceeds the invoice amount limit.`);
}

function parseInvoiceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid invoice date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid invoice date.");
  }
  return date;
}

export async function createPosGeneralStockSale(input: CreatePosSaleInput) {
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new Error("A POS invoice must contain between 1 and 100 items.");
  }

  if (input.taxMode !== "LOCAL" && input.taxMode !== "INTERSTATE") {
    throw new Error("Select a valid tax mode.");
  }
  const salesChannel = input.salesChannel ?? "COUNTER";
  if (salesChannel !== "COUNTER" && salesChannel !== "ONLINE_STORE") {
    throw new Error("Select a valid POS sales channel.");
  }
  const shippingAddress = input.shippingAddress ?? null;
  if (salesChannel === "ONLINE_STORE" && !shippingAddress) {
    throw new Error("A shipping address is required for an online-store sale.");
  }
  if (salesChannel === "ONLINE_STORE" && shippingAddress?.countryCode.trim().toUpperCase() !== "IN") {
    throw new Error("Online-store checkout currently supports shipping addresses within India.");
  }
  if (shippingAddress) {
    const requiredAddressFields = [
      shippingAddress.recipientName,
      shippingAddress.phone,
      shippingAddress.addressLine1,
      shippingAddress.city,
      shippingAddress.state,
      shippingAddress.postalCode,
      shippingAddress.countryCode,
    ];
    if (requiredAddressFields.some((value) => typeof value !== "string" || !value.trim())
      || (shippingAddress.addressLine2 !== null && typeof shippingAddress.addressLine2 !== "string")
      || shippingAddress.recipientName.trim().length > 200
      || shippingAddress.phone.trim().length > 40
      || shippingAddress.addressLine1.trim().length > 200
      || (shippingAddress.addressLine2?.trim().length ?? 0) > 200
      || shippingAddress.city.trim().length > 100
      || shippingAddress.state.trim().length > 100
      || shippingAddress.postalCode.trim().length > 20
      || !/^[A-Z]{2}$/.test(shippingAddress.countryCode.trim().toUpperCase())) {
      throw new Error("Enter a valid shipping address.");
    }
  }
  const requestKey = input.requestKey.trim();
  if (!requestKey || requestKey.length > 100) throw new Error("A valid POS sale request key is required.");
  const invoiceDate = parseInvoiceDate(input.invoiceDate);
  const entityId = input.entityId.trim();
  if (!entityId || entityId.length > 100) throw new Error("Select an active Entity before posting the invoice.");
  const requestedCouponCode = input.couponCode?.trim().toUpperCase() || null;
  if (requestedCouponCode && (requestedCouponCode.length > 60 || !/^[A-Z0-9][A-Z0-9-]*$/.test(requestedCouponCode))) {
    throw new Error("Enter a valid coupon code.");
  }
  const requestedCustomerContactId = input.customerContactId?.trim() || null;
  if (input.customerContactId !== undefined && input.customerContactId !== null
    && (!requestedCustomerContactId || requestedCustomerContactId.length > 100)) {
    throw new Error("Select a valid customer contact.");
  }
  const requestedCustomer = input.customer?.trim()
    ? normalizeUppercase(input.customer.trim())
    : null;
  if (requestedCustomer && requestedCustomer.length > 255) {
    throw new Error("Customer name must be 255 characters or fewer.");
  }

  const normalizedLines = input.lines.map((line) => {
    const stockId = line.stockId.trim();
    if (!stockId) throw new Error("Every invoice item must reference General finished-goods stock.");
    const stockType = line.stockType ?? "GENERAL_GRN";
    if (stockType !== "SKU" && stockType !== "GENERAL_GRN") {
      throw new Error("Every invoice item must reference a supported General stock type.");
    }
    const quantityDecimal = parseDecimal(line.quantity, "Quantity", 0, 2_147_483_647);
    if (quantityDecimal.isZero()) throw new Error("Quantity must be greater than zero.");
    const hsnCode = line.hsnCode?.trim() || null;
    if (hsnCode && hsnCode.length > 100) throw new Error("HSN code must be 100 characters or fewer.");
    const offerId = line.offerId?.trim() || null;
    if (offerId && offerId.length > 100) throw new Error("Select a valid POS offer.");
    return {
      stockId,
      stockType,
      quantity: quantityDecimal.toNumber(),
      rate: parseDecimal(line.rate, "Price", 4),
      gstRate: parseDecimal(line.gstRate, "GST rate", 2, 100),
      discountPercent: parseDecimal(line.discountPercent, "Discount", 2, 100),
      hsnCode,
      offerId,
    };
  });
  if (salesChannel === "ONLINE_STORE"
    && (requestedCouponCode || normalizedLines.some((line) =>
      line.stockType !== "SKU" || line.offerId || !line.discountPercent.isZero(),
    ))) {
    throw new Error("Online-store sales require eligible SKU items without manual discounts or POS offers.");
  }
  if (new Set(normalizedLines.map((line) => stockKey(line.stockType, line.stockId))).size !== normalizedLines.length) {
    throw new Error("A General stock record can only appear once per invoice.");
  }

  return prisma.$transaction(async (transaction) => {
    const existingInvoice = await transaction.posSalesInvoice.findFirst({
      where: { organization_id: input.organizationId, request_key: requestKey },
      select: {
        id: true,
        invoice_no: true,
        invoice_date: true,
        customer: true,
        tax_mode: true,
        subtotal: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        tax_amount: true,
        total_amount: true,
        coupon_discount_amount: true,
        shipping_address: true,
        entity: { select: { entity_name: true } },
        couponRedemption: { select: { coupon_code: true } },
        issuedCoupon: { select: { coupon_code: true } },
      },
    });
    if (existingInvoice) {
      return {
        id: existingInvoice.id,
        invoiceNo: existingInvoice.invoice_no,
        invoiceDate: existingInvoice.invoice_date,
        customer: existingInvoice.customer,
        entityName: existingInvoice.entity?.entity_name ?? "",
        taxMode: existingInvoice.tax_mode as "LOCAL" | "INTERSTATE",
        subtotal: existingInvoice.subtotal.toFixed(2),
        cgstAmount: existingInvoice.cgst_amount.toFixed(2),
        sgstAmount: existingInvoice.sgst_amount.toFixed(2),
        igstAmount: existingInvoice.igst_amount.toFixed(2),
        taxAmount: existingInvoice.tax_amount.toFixed(2),
        totalAmount: existingInvoice.total_amount.toFixed(2),
        couponDiscountAmount: existingInvoice.coupon_discount_amount.toFixed(2),
        appliedCouponCode: existingInvoice.couponRedemption?.coupon_code ?? null,
        issuedCouponCode: existingInvoice.issuedCoupon?.coupon_code ?? null,
      };
    }
    const entity = await transaction.masterEntity.findFirst({
      where: { id: entityId, organization_id: input.organizationId, is_active: true },
      select: { id: true, entity_name: true },
    });
    if (!entity) throw new Error("Select an active Entity belonging to this organization.");
    let invoiceTaxMode = input.taxMode;
    if (salesChannel === "ONLINE_STORE" && shippingAddress) {
      const organization = await transaction.organization.findFirst({
        where: { id: input.organizationId },
        select: { state: true },
      });
      const sellerState = normalizeUppercase(organization?.state?.trim() ?? "").replace(/[^A-Z0-9]/g, "");
      const recipientState = normalizeUppercase(shippingAddress.state.trim()).replace(/[^A-Z0-9]/g, "");
      if (!sellerState) {
        throw new Error("Set the organization state before online-store checkout so GST can be calculated.");
      }
      invoiceTaxMode = sellerState === recipientState ? "LOCAL" : "INTERSTATE";
    }
    const customerContact = requestedCustomerContactId
      ? await transaction.contact.findFirst({
          where: {
            organization_id: input.organizationId,
            id: requestedCustomerContactId,
            is_active: true,
            roles: { some: { role_code: "CUSTOMER", is_active: true } },
          },
          select: { id: true, legal_name: true, display_name: true },
        })
      : null;
    if (requestedCustomerContactId && !customerContact) {
      throw new Error("Select an active contact with the Customer role.");
    }
    const customer = customerContact
      ? customerContact.display_name || customerContact.legal_name
      : requestedCustomer;
    const generalReceiptIds = normalizedLines
      .filter((line) => line.stockType === "GENERAL_GRN")
      .map((line) => line.stockId);
    const skuStockIds = normalizedLines
      .filter((line) => line.stockType === "SKU")
      .map((line) => line.stockId);
    const [generalReceiptRecords, skuStockRecords] = await Promise.all([
      generalReceiptIds.length
        ? transaction.finishedGoodsGeneralStockReceipt.findMany({
            where: { organization_id: input.organizationId, id: { in: generalReceiptIds } },
            select: {
              id: true,
              entity_id: true,
              style_name: true,
              order_no: true,
              article_no: true,
              size: true,
              colour: true,
              product_category: true,
              location_id: true,
              current_stock: true,
            },
          })
        : Promise.resolve([]),
      skuStockIds.length
        ? transaction.finishedGoodsSkuStock.findMany({
            where: {
              organization_id: input.organizationId,
              id: { in: skuStockIds },
              source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
            },
            select: {
              id: true,
              entity_id: true,
              style_name: true,
              order_no: true,
              article_no: true,
              size: true,
              colour: true,
              product_category: true,
              sub_product_category: true,
              location_id: true,
              current_stock: true,
              sales_price: true,
              mrp: true,
              gst_rate: true,
              hsn_code: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const stockRecords: PosSaleStockRecord[] = [
      ...generalReceiptRecords.map((record) => ({
        ...record,
        sub_product_category: null,
        stockType: "GENERAL_GRN" as const,
      })),
      ...skuStockRecords.map((record) => ({ ...record, stockType: "SKU" as const })),
    ];
    if (stockRecords.length !== normalizedLines.length) {
      throw new Error("One or more selected items are not General stock in this organization.");
    }
    if (stockRecords.some((stock) => stock.entity_id !== entity.id)) {
      throw new Error("Every selected stock item must belong to the selected Entity.");
    }
    const stockByKey = new Map(stockRecords.map((stock) => [stockKey(stock.stockType, stock.id), stock]));
    if (salesChannel === "ONLINE_STORE") {
      for (const line of normalizedLines) {
        const stock = stockByKey.get(stockKey(line.stockType, line.stockId));
        if (!stock || stock.stockType !== "SKU") {
          throw new Error("Online-store items must be eligible POS SKU stock.");
        }
        const catalogPrice = stock.sales_price ?? stock.mrp;
        if (catalogPrice === null || catalogPrice === undefined || new Prisma.Decimal(catalogPrice).lte(0)) {
          throw new Error(`${stock.style_name} has no active catalog sales price.`);
        }
        line.rate = parseDecimal(String(catalogPrice), "Catalog price", 4);
        line.gstRate = parseDecimal(String(stock.gst_rate ?? 0), "GST rate", 2, 100);
        line.hsnCode = stock.hsn_code?.trim() || null;
      }
    }
    const requestedGstRates = [...new Set(normalizedLines.map((line) => line.gstRate.toFixed(2)))];
    const configuredGstRates = await transaction.masterGst.findMany({
      where: {
        organization_id: input.organizationId,
        is_active: true,
        gst: { in: requestedGstRates.map((rate) => new Prisma.Decimal(rate)) },
      },
      select: { gst: true, cgst_rate: true, sgst_rate: true, igst_rate: true },
    });
    const gstByRate = new Map(configuredGstRates.map((rate) => [
      rate.gst?.toFixed(2) ?? "0.00",
      rate,
    ]));
    const requestedOfferIds = [...new Set(normalizedLines.flatMap((line) => line.offerId ? [line.offerId] : []))];
    const selectedOffers = requestedOfferIds.length
      ? await transaction.posOffer.findMany({
          where: {
            organization_id: input.organizationId,
            id: { in: requestedOfferIds },
            status: PosOfferStatus.ACTIVE,
            starts_at: { lte: invoiceDate },
            OR: [{ ends_at: null }, { ends_at: { gte: invoiceDate } }],
          },
          include: POS_SALE_OFFER_INCLUDE,
        })
      : [];
    const offerById = new Map(selectedOffers.map((offer) => [offer.id, offer]));
    if (selectedOffers.length !== requestedOfferIds.length) {
      throw new Error("One or more selected offers are inactive or not available on the invoice date.");
    }
    const pricingLines = normalizedLines.map((line) => {
      const stock = stockByKey.get(stockKey(line.stockType, line.stockId));
      if (!stock) throw new Error("A selected General stock record was not found.");
      const availableStock = new Prisma.Decimal(stock.current_stock);
      if (availableStock.lt(line.quantity)) {
        throw new Error(`${stock.style_name} has only ${stock.current_stock} General units available.`);
      }
      const baseTaxableAmount = money(
        new Prisma.Decimal(line.quantity)
          .mul(line.rate)
          .mul(new Prisma.Decimal(100).minus(line.discountPercent).div(100)),
      );
      const selectedOffer = line.offerId ? offerById.get(line.offerId) ?? null : null;
      if (selectedOffer && !offerMatchesStock(selectedOffer, stock)) {
        throw new Error(`${selectedOffer.offer_code} is not eligible for ${stock.style_name}.`);
      }
      const offerDiscountAmount = calculateOfferDiscount(selectedOffer, line, baseTaxableAmount);
      const taxableAmountBeforeCoupon = baseTaxableAmount.minus(offerDiscountAmount);
      const configuredRate = gstByRate.get(line.gstRate.toFixed(2));
      if (!configuredRate && !line.gstRate.isZero()) {
        throw new Error(`GST ${line.gstRate.toFixed(2)}% is not configured as active for this organization.`);
      }
      const componentRate = invoiceTaxMode === "LOCAL"
        ? (configuredRate?.cgst_rate && configuredRate.sgst_rate
          ? configuredRate.cgst_rate.plus(configuredRate.sgst_rate)
          : new Prisma.Decimal(0))
        : configuredRate?.igst_rate ?? new Prisma.Decimal(0);
      if (!line.gstRate.isZero() && !componentRate.equals(line.gstRate)) {
        throw new Error(`GST component rates for ${line.gstRate.toFixed(2)}% are not configured correctly.`);
      }
      return {
        line,
        stock,
        baseTaxableAmount: taxableAmountBeforeCoupon,
        offerDiscountAmount,
        selectedOffer,
        configuredRate,
      };
    });
    const subtotalBeforeCoupon = pricingLines.reduce(
      (total, item) => total.plus(item.baseTaxableAmount),
      new Prisma.Decimal(0),
    );

    let redemption: {
      couponId: string;
      couponIssueId: string | null;
      couponCode: string;
      discountType: PosCouponDiscountType;
      discountValue: Prisma.Decimal;
      minimumPurchase: Prisma.Decimal;
      maxRedemptions: number | null;
    } | null = null;
    if (requestedCouponCode) {
      const generalCoupon = await transaction.posCoupon.findFirst({
        where: {
          organization_id: input.organizationId,
          coupon_code: requestedCouponCode,
        },
        select: {
          id: true,
          coupon_code: true,
          coupon_type: true,
          status: true,
          discount_type: true,
          discount_value: true,
          minimum_purchase: true,
          starts_at: true,
          ends_at: true,
          max_redemptions: true,
        },
      });
      if (generalCoupon) {
        if (generalCoupon.coupon_type !== PosCouponType.GENERAL) {
          throw new Error("This code is not a redeemable general coupon.");
        }
        if (generalCoupon.status !== PosCouponStatus.ACTIVE
          || invoiceDate < generalCoupon.starts_at
          || (generalCoupon.ends_at && invoiceDate > generalCoupon.ends_at)) {
          throw new Error("This coupon is not active on the invoice date.");
        }
        redemption = {
          couponId: generalCoupon.id,
          couponIssueId: null,
          couponCode: generalCoupon.coupon_code ?? requestedCouponCode,
          discountType: generalCoupon.discount_type,
          discountValue: generalCoupon.discount_value,
          minimumPurchase: generalCoupon.minimum_purchase,
          maxRedemptions: generalCoupon.max_redemptions,
        };
      } else {
        const couponIssue = await transaction.posCouponIssue.findFirst({
          where: {
            organization_id: input.organizationId,
            coupon_code: requestedCouponCode,
            status: PosCouponIssueStatus.AVAILABLE,
            OR: [{ expires_at: null }, { expires_at: { gte: invoiceDate } }],
            coupon: { status: PosCouponStatus.ACTIVE },
          },
          include: {
            coupon: {
              select: {
                id: true,
                status: true,
                discount_type: true,
                discount_value: true,
                max_redemptions: true,
              },
            },
          },
        });
        if (!couponIssue) throw new Error("Coupon code was not found, is expired, or has already been used.");
        if (!customerContact || couponIssue.customer_contact_id !== customerContact.id) {
          throw new Error("This reward coupon is assigned to a different customer.");
        }
        redemption = {
          couponId: couponIssue.coupon.id,
          couponIssueId: couponIssue.id,
          couponCode: couponIssue.coupon_code,
          discountType: couponIssue.coupon.discount_type,
          discountValue: couponIssue.coupon.discount_value,
          minimumPurchase: new Prisma.Decimal(0),
          maxRedemptions: couponIssue.coupon.max_redemptions,
        };
      }

      if (subtotalBeforeCoupon.lt(redemption.minimumPurchase)) {
        throw new Error("The sale does not meet this coupon's minimum purchase amount.");
      }
      if (redemption.maxRedemptions !== null) {
        const redemptionCount = await transaction.posCouponRedemption.count({
          where: { organization_id: input.organizationId, coupon_id: redemption.couponId },
        });
        if (redemptionCount >= redemption.maxRedemptions) {
          throw new Error("This coupon campaign has reached its redemption limit.");
        }
      }
    }

    const couponDiscountAmount = redemption
      ? money(redemption.discountType === PosCouponDiscountType.PERCENTAGE
        ? subtotalBeforeCoupon.mul(redemption.discountValue).div(100)
        : Prisma.Decimal.min(subtotalBeforeCoupon, redemption.discountValue))
      : new Prisma.Decimal(0);
    if (requestedCouponCode && couponDiscountAmount.isZero()) {
      throw new Error("This coupon cannot be applied to a zero-value sale.");
    }
    const totals = {
      subtotal: new Prisma.Decimal(0),
      cgst: new Prisma.Decimal(0),
      sgst: new Prisma.Decimal(0),
      igst: new Prisma.Decimal(0),
    };
    const couponAllocations = pricingLines.map(({ baseTaxableAmount }) =>
      !redemption || subtotalBeforeCoupon.isZero()
        ? new Prisma.Decimal(0)
        : couponDiscountAmount.mul(baseTaxableAmount).div(subtotalBeforeCoupon)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
    );
    let remainingCouponDiscount = couponDiscountAmount.minus(
      couponAllocations.reduce((total, allocation) => total.plus(allocation), new Prisma.Decimal(0)),
    );
    for (let index = 0; index < couponAllocations.length && remainingCouponDiscount.gt(0); index += 1) {
      const available = pricingLines[index].baseTaxableAmount.minus(couponAllocations[index]);
      if (available.isZero()) continue;
      const penny = new Prisma.Decimal("0.01");
      const allocation = remainingCouponDiscount.lt(penny) ? remainingCouponDiscount : penny;
      const added = available.lt(allocation) ? available : allocation;
      couponAllocations[index] = couponAllocations[index].plus(added);
      remainingCouponDiscount = remainingCouponDiscount.minus(added);
    }
    if (!remainingCouponDiscount.isZero()) {
      throw new Error("Unable to allocate coupon discount across invoice lines.");
    }
    const invoiceLines = pricingLines.map((item, index) => {
      const { line, stock, baseTaxableAmount, offerDiscountAmount, selectedOffer, configuredRate } = item;
      const allocatedDiscount = couponAllocations[index];
      const taxableAmount = baseTaxableAmount.minus(allocatedDiscount);
      const taxAmount = money(taxableAmount.mul(line.gstRate).div(100));
      assertMoneyRange(taxableAmount, "Line amount");
      assertMoneyRange(taxAmount, "Line tax");
      const cgstAmount = invoiceTaxMode === "LOCAL"
        ? money(taxableAmount.mul(configuredRate?.cgst_rate ?? 0).div(100))
        : new Prisma.Decimal(0);
      const sgstAmount = invoiceTaxMode === "LOCAL"
        ? taxAmount.minus(cgstAmount)
        : new Prisma.Decimal(0);
      const igstAmount = invoiceTaxMode === "INTERSTATE" ? taxAmount : new Prisma.Decimal(0);
      const lineTotal = taxableAmount.plus(taxAmount);
      assertMoneyRange(lineTotal, "Line total");
      totals.subtotal = totals.subtotal.plus(taxableAmount);
      totals.cgst = totals.cgst.plus(cgstAmount);
      totals.sgst = totals.sgst.plus(sgstAmount);
      totals.igst = totals.igst.plus(igstAmount);
      assertMoneyRange(totals.subtotal, "Invoice subtotal");
      assertMoneyRange(totals.cgst.plus(totals.sgst).plus(totals.igst), "Invoice tax");

      return {
        organization_id: input.organizationId,
        general_stock_receipt_id: stock.stockType === "GENERAL_GRN" ? stock.id : null,
        sku_stock_id: stock.stockType === "SKU" ? stock.id : null,
        style_name: stock.style_name,
        order_no: stock.order_no,
        article_no: stock.article_no ?? "",
        size: stock.size ?? "",
        colour: stock.colour,
        quantity: line.quantity,
        unit_rate: line.rate,
        gst_rate: line.gstRate,
        discount_percent: line.discountPercent,
        offer_discount_amount: offerDiscountAmount,
        offer_snapshot: selectedOffer ? serializeOfferSnapshot(selectedOffer, offerDiscountAmount) : Prisma.DbNull,
        hsn_code: line.hsnCode,
        taxable_amount: taxableAmount,
        cgst_amount: cgstAmount,
        sgst_amount: sgstAmount,
        igst_amount: igstAmount,
        total_amount: lineTotal,
      };
    });
    assertMoneyRange(totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst), "Invoice total");

    const invoiceNo = await reserveProcurementDocumentNumber(
      input.organizationId,
      "POS_SALES_INVOICE",
      transaction,
    );
    const invoice = await transaction.posSalesInvoice.create({
      data: {
        organization_id: input.organizationId,
        entity_id: entity.id,
        invoice_no: invoiceNo,
        request_key: requestKey,
        invoice_date: invoiceDate,
        customer,
        customer_contact_id: customerContact?.id ?? null,
        shipping_address: shippingAddress
          ? {
              recipientName: normalizeUppercase(shippingAddress.recipientName.trim()),
              phone: shippingAddress.phone.trim(),
              addressLine1: normalizeUppercase(shippingAddress.addressLine1.trim()),
              addressLine2: shippingAddress.addressLine2?.trim()
                ? normalizeUppercase(shippingAddress.addressLine2.trim())
                : null,
              city: normalizeUppercase(shippingAddress.city.trim()),
              state: normalizeUppercase(shippingAddress.state.trim()),
              postalCode: normalizeUppercase(shippingAddress.postalCode.trim()),
              countryCode: shippingAddress.countryCode.trim().toUpperCase(),
            }
          : Prisma.DbNull,
        tax_mode: invoiceTaxMode,
        status: "POSTED",
        subtotal: totals.subtotal,
        cgst_amount: totals.cgst,
        sgst_amount: totals.sgst,
        igst_amount: totals.igst,
        tax_amount: totals.cgst.plus(totals.sgst).plus(totals.igst),
        coupon_discount_amount: couponDiscountAmount,
        total_amount: totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst),
        created_by: input.actorId ?? "PUBLIC_STORE",
      },
      select: { id: true },
    });

    if (redemption) {
      if (redemption.couponIssueId) {
        const markedRedeemed = await transaction.posCouponIssue.updateMany({
          where: {
            id: redemption.couponIssueId,
            organization_id: input.organizationId,
            status: PosCouponIssueStatus.AVAILABLE,
          },
          data: {
            status: PosCouponIssueStatus.REDEEMED,
            redeemed_invoice_id: invoice.id,
            redeemed_at: new Date(),
          },
        });
        if (markedRedeemed.count !== 1) {
          throw new Error("This reward coupon was already redeemed. Refresh and retry.");
        }
      }
      await transaction.posCouponRedemption.create({
        data: {
          organization_id: input.organizationId,
          coupon_id: redemption.couponId,
          coupon_issue_id: redemption.couponIssueId,
          invoice_id: invoice.id,
          coupon_code: redemption.couponCode,
          discount_amount: couponDiscountAmount,
        },
      });
    }

    let issuedCouponCode: string | null = null;
    const rewardCampaign = salesChannel === "ONLINE_STORE"
      ? null
      : await transaction.posCoupon.findFirst({
          where: {
            organization_id: input.organizationId,
            coupon_type: PosCouponType.PURCHASE_REWARD,
            status: PosCouponStatus.ACTIVE,
            starts_at: { lte: invoiceDate },
            minimum_purchase: { lte: totals.subtotal },
            OR: [{ ends_at: null }, { ends_at: { gte: invoiceDate } }],
          },
          select: {
            id: true,
            discount_value: true,
            validity_days: true,
            max_redemptions: true,
          },
        });
    if (rewardCampaign) {
      if (!customerContact) {
        throw new Error("Select a registered customer to issue the purchase reward for this qualifying sale.");
      }
      const campaignRedemptions = rewardCampaign.max_redemptions === null
        ? 0
        : await transaction.posCouponRedemption.count({
            where: { organization_id: input.organizationId, coupon_id: rewardCampaign.id },
          });
      if (rewardCampaign.max_redemptions === null || campaignRedemptions < rewardCampaign.max_redemptions) {
        const validityDays = rewardCampaign.validity_days;
        if (!validityDays || validityDays < 1) {
          throw new Error("The purchase-reward campaign has invalid reward validity settings.");
        }
        issuedCouponCode = `CC-${randomBytes(8).toString("hex").toUpperCase()}`;
        const expiresAt = new Date(invoiceDate);
        expiresAt.setUTCDate(expiresAt.getUTCDate() + validityDays);
        await transaction.posCouponIssue.create({
          data: {
            organization_id: input.organizationId,
            coupon_id: rewardCampaign.id,
            customer_contact_id: customerContact.id,
            issued_invoice_id: invoice.id,
            coupon_code: issuedCouponCode,
            status: PosCouponIssueStatus.AVAILABLE,
            expires_at: expiresAt,
          },
        });
      }
    }

    for (const line of normalizedLines) {
      const stock = stockByKey.get(stockKey(line.stockType, line.stockId));
      if (!stock) throw new Error("A selected General stock record was not found.");
      const stockWhere = {
        id: stock.id,
        organization_id: input.organizationId,
        current_stock: { gte: line.quantity },
      };
      const deducted = stock.stockType === "SKU"
        ? await transaction.finishedGoodsSkuStock.updateMany({
            where: stockWhere,
            data: {
              current_stock: { decrement: line.quantity },
              qty_out: { increment: line.quantity },
            },
          })
        : await transaction.finishedGoodsGeneralStockReceipt.updateMany({
            where: stockWhere,
            data: {
              current_stock: { decrement: line.quantity },
              quantity_out: { increment: line.quantity },
            },
          });
      if (deducted.count !== 1) {
        throw new Error(`${stock.style_name} no longer has enough General stock. Refresh and retry.`);
      }
      if (stock.stockType === "GENERAL_GRN") {
        const summaryUpdated = await transaction.finishedGoodsStock.updateMany({
          where: {
            organization_id: input.organizationId,
            location_id: stock.location_id,
            style_name: stock.style_name,
            size: stock.size,
            quantity_on_hand: { gte: line.quantity },
          },
          data: {
            quantity_on_hand: { decrement: line.quantity },
            quantity_issued: { increment: line.quantity },
          },
        });
        if (summaryUpdated.count !== 1) {
          throw new Error("Finished-goods summary does not match General stock; sale was not posted.");
        }
      }
    }

    const createdInvoiceLines = await transaction.posSalesInvoiceLine.createManyAndReturn({
      data: invoiceLines.map((line) => ({ ...line, invoice_id: invoice.id })),
      select: { id: true, general_stock_receipt_id: true, sku_stock_id: true },
    });
    const invoiceLineIdByStockId = new Map(
      createdInvoiceLines.map((line) => [
        stockKey(line.sku_stock_id ? "SKU" : "GENERAL_GRN", line.sku_stock_id ?? line.general_stock_receipt_id ?? ""),
        line.id,
      ]),
    );
    await createFgMaterialIssue(transaction, {
      organizationId: input.organizationId,
      sourceType: FGMaterialIssueSource.POS_INVOICE,
      movement: FGMaterialIssueMovement.ISSUE,
      posInvoiceId: invoice.id,
      idempotencyKey: `pos-invoice:${invoice.id}:issue`,
      sourceReference: invoiceNo,
      issuedBy: input.actorId ?? "PUBLIC_STORE",
      lines: invoiceLines.map((line) => {
        const stockType = line.sku_stock_id ? "SKU" : "GENERAL_GRN";
        const sourceId = line.sku_stock_id ?? line.general_stock_receipt_id;
        if (!sourceId) throw new Error("A posted POS invoice line has no matching General stock record.");
        const stock = stockByKey.get(stockKey(stockType, sourceId));
        if (!stock) throw new Error("A posted POS invoice line has no matching General stock record.");
        const stockBefore = new Prisma.Decimal(stock.current_stock);
        const quantity = new Prisma.Decimal(line.quantity);
        const posInvoiceLineId = invoiceLineIdByStockId.get(stockKey(stockType, sourceId));
        if (!posInvoiceLineId) throw new Error("A posted POS invoice line could not be linked to its stock movement.");
        return {
          stockType: stockType === "SKU" ? FGMaterialIssueStockType.SKU : FGMaterialIssueStockType.GENERAL,
          skuStockId: stockType === "SKU" ? stock.id : null,
          generalReceiptId: stockType === "GENERAL_GRN" ? stock.id : null,
          posInvoiceLineId,
          styleName: line.style_name,
          articleNo: line.article_no,
          size: line.size,
          colour: line.colour,
          quantity,
          uomCode: "PCS",
          stockBefore,
          stockAfter: stockBefore.minus(quantity),
        };
      }),
    });
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "POS",
      action: "POST_GENERAL_FG_SALE",
      entityType: "pos_sales_invoice",
      entityId: invoice.id,
      details: {
        invoiceNo,
        entityId: entity.id,
        lineCount: invoiceLines.length,
        totalAmount: totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst).toFixed(2),
        couponCode: redemption?.couponCode ?? null,
        couponDiscountAmount: couponDiscountAmount.toFixed(2),
        issuedCouponCode,
        offers: pricingLines.flatMap(({ selectedOffer, offerDiscountAmount }) => selectedOffer ? [{
          offerCode: selectedOffer.offer_code,
          offerDiscountAmount: offerDiscountAmount.toFixed(2),
        }] : []),
        stockMovements: normalizedLines.map((line) => {
          const stock = stockByKey.get(stockKey(line.stockType, line.stockId));
          return {
            stockId: line.stockId,
            stockType: line.stockType,
            quantity: line.quantity,
            beforeQuantity: stock ? new Prisma.Decimal(stock.current_stock).toString() : null,
            afterQuantity: stock ? new Prisma.Decimal(stock.current_stock).minus(line.quantity).toString() : null,
          };
        }),
      },
    }, transaction);

    return {
      id: invoice.id,
      invoiceNo,
      invoiceDate,
      customer,
      entityId: entity.id,
      entityName: entity.entity_name,
      taxMode: invoiceTaxMode,
      subtotal: totals.subtotal.toFixed(2),
      cgstAmount: totals.cgst.toFixed(2),
      sgstAmount: totals.sgst.toFixed(2),
      igstAmount: totals.igst.toFixed(2),
      taxAmount: totals.cgst.plus(totals.sgst).plus(totals.igst).toFixed(2),
      totalAmount: totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst).toFixed(2),
      couponDiscountAmount: couponDiscountAmount.toFixed(2),
      appliedCouponCode: redemption?.couponCode ?? null,
      issuedCouponCode,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
}

export async function isPosPurchaseRewardAvailable(input: {
  organizationId: string;
  invoiceDate: string;
  subtotal: string;
}) {
  const invoiceDate = parseInvoiceDate(input.invoiceDate);
  const subtotal = money(parseDecimal(input.subtotal, "Sale subtotal", 2));
  if (subtotal.isZero()) return false;

  const rewardCampaign = await prisma.posCoupon.findFirst({
    where: {
      organization_id: input.organizationId,
      coupon_type: PosCouponType.PURCHASE_REWARD,
      status: PosCouponStatus.ACTIVE,
      starts_at: { lte: invoiceDate },
      minimum_purchase: { lte: subtotal },
      OR: [{ ends_at: null }, { ends_at: { gte: invoiceDate } }],
    },
    select: {
      id: true,
      max_redemptions: true,
    },
  });
  if (!rewardCampaign) return false;
  if (rewardCampaign.max_redemptions === null) return true;

  const redemptionCount = await prisma.posCouponRedemption.count({
    where: { organization_id: input.organizationId, coupon_id: rewardCampaign.id },
  });
  return redemptionCount < rewardCampaign.max_redemptions;
}
