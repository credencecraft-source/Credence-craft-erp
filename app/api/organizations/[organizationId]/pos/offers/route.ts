import { NextResponse } from "next/server";
import { PosOfferScope, PosOfferStatus, PosOfferType } from "@prisma/client";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  getPosOfferScopeBySlug,
  getPosOfferTypeBySlug,
  isPosOfferStatus,
} from "@/lib/services/pos/pos-offer-contract";
import {
  createPosOffer,
  listEligiblePosOffersByStock,
  listPosOffers,
  listPosOfferTargetOptions,
  PosOfferConflictError,
  PosOfferValidationError,
} from "@/lib/services/pos/pos-offer-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_LOOKUP_PAGE_SIZE = 50;
const OFFER_ROLES = ["OWNER", "ADMIN", "FINANCE", "INVENTORY"];

function parseCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.id !== "string"
      || !parsed.id
      || parsed.id.length > 100
      || typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) {
      return null;
    }
    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: { id: string; createdAt: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function readOptionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new PosOfferValidationError(`${key} must be a text value.`);
  }
  return value;
}

function requestError(error: unknown, fallback: string) {
  if (error instanceof PosOfferValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PosOfferConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "You do not have permission to manage offers for this organization." }, { status: 403 });
  }
  console.error("POS offer request failed", { operation: fallback });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, OFFER_ROLES);
    await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_OFFERS");
    const searchParams = new URL(request.url).searchParams;
    const lookupScopeSlug = searchParams.get("lookupScope");
    const rawLimit = searchParams.get("limit");

    if (searchParams.get("eligibleStock") === "true") {
      const entityId = searchParams.get("entityId") ?? "";
      const invoiceDate = searchParams.get("invoiceDate") ?? "";
      const stockKeys = searchParams.getAll("stock");
      const result = await listEligiblePosOffersByStock({
        organizationId: organization.id,
        entityId,
        invoiceDate,
        stockKeys,
      });
      return NextResponse.json(result);
    }

    if (lookupScopeSlug !== null) {
      const scope = getPosOfferScopeBySlug(lookupScopeSlug);
      if (!scope) throw new PosOfferValidationError("Select a valid offer scope.");
      const lookupLimit = rawLimit === null ? MAX_LOOKUP_PAGE_SIZE : Number(rawLimit);
      if (!Number.isInteger(lookupLimit) || lookupLimit < 1 || lookupLimit > MAX_LOOKUP_PAGE_SIZE) {
        throw new PosOfferValidationError(`Lookup limit must be between 1 and ${MAX_LOOKUP_PAGE_SIZE}.`);
      }
      const options = await listPosOfferTargetOptions({
        organizationId: organization.id,
        scope: scope.value as PosOfferScope,
        search: searchParams.get("search") ?? "",
        limit: lookupLimit,
      });
      return NextResponse.json({ options });
    }

    const rawOfferType = searchParams.get("offerType");
    const rawScope = searchParams.get("scope");
    const offerType = rawOfferType ? getPosOfferTypeBySlug(rawOfferType) : undefined;
    const scope = rawScope ? getPosOfferScopeBySlug(rawScope) : undefined;
    if ((rawOfferType && !offerType) || (rawScope && !scope)) {
      throw new PosOfferValidationError("Select a valid offer type or scope.");
    }
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new PosOfferValidationError(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
    }
    const rawStatus = searchParams.get("status");
    if (rawStatus !== null && !isPosOfferStatus(rawStatus)) {
      throw new PosOfferValidationError("Select a valid offer status.");
    }
    const rawCursor = searchParams.get("cursor");
    const cursor = rawCursor ? parseCursor(rawCursor) : null;
    if (rawCursor && !cursor) throw new PosOfferValidationError("Invalid offer pagination cursor.");

    const result = await listPosOffers({
      organizationId: organization.id,
      ...(offerType ? { offerType: offerType.value as PosOfferType } : {}),
      ...(scope ? { scope: scope.value as PosOfferScope } : {}),
      status: rawStatus ? rawStatus as PosOfferStatus : undefined,
      search: searchParams.get("search") ?? "",
      cursor,
      limit,
    });
    return NextResponse.json({
      offers: result.offers,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    });
  } catch (error) {
    return requestError(error, "Unable to load POS offers.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, OFFER_ROLES);
    await requireOrganizationPermission(user.id, organization.id, "MANAGE_POS_OFFERS");
    const body = await request.json().catch(() => {
      throw new PosOfferValidationError("Offer details must be valid JSON.");
    }) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new PosOfferValidationError("Offer details must be sent as an object.");
    }
    const record = body as Record<string, unknown>;
    const offerType = typeof record.offerType === "string" ? getPosOfferTypeBySlug(record.offerType) : undefined;
    const scope = typeof record.scope === "string" ? getPosOfferScopeBySlug(record.scope) : undefined;
    const status = typeof record.status === "string" ? record.status : "DRAFT";
    if (!offerType) throw new PosOfferValidationError("Select a valid offer type.");
    if (!scope) throw new PosOfferValidationError("Select a valid offer scope.");
    if (!isPosOfferStatus(status)) throw new PosOfferValidationError("Select a valid offer status.");
    if (record.targetIds !== undefined
      && (!Array.isArray(record.targetIds) || !record.targetIds.every((id) => typeof id === "string"))) {
      throw new PosOfferValidationError("Offer targets must be a list of IDs.");
    }

    const offer = await createPosOffer({
      organizationId: organization.id,
      actorId: user.id,
      requestKey: typeof record.requestKey === "string" ? record.requestKey : "",
      offerCode: typeof record.offerCode === "string" ? record.offerCode : "",
      name: typeof record.name === "string" ? record.name : "",
      description: readOptionalString(record, "description"),
      offerType: offerType.value as PosOfferType,
      scope: scope.value as PosOfferScope,
      status: status as PosOfferStatus,
      discountAmount: readOptionalString(record, "discountAmount"),
      discountPercentage: readOptionalString(record, "discountPercentage"),
      buyQuantity: readOptionalString(record, "buyQuantity"),
      getQuantity: readOptionalString(record, "getQuantity"),
      getDiscountPercentage: readOptionalString(record, "getDiscountPercentage"),
      comboPrice: readOptionalString(record, "comboPrice"),
      startsAt: typeof record.startsAt === "string" ? record.startsAt : "",
      endsAt: readOptionalString(record, "endsAt"),
      targetIds: Array.isArray(record.targetIds) ? record.targetIds as string[] : [],
    });
    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    return requestError(error, "Unable to create the POS offer.");
  }
}
