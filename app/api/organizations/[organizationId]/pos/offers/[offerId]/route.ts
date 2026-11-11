import { NextResponse } from "next/server";
import { PosOfferScope, PosOfferStatus, PosOfferType } from "@prisma/client";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  getPosOffer,
  PosOfferConflictError,
  PosOfferNotFoundError,
  PosOfferValidationError,
  updatePosOffer,
} from "@/lib/services/pos/pos-offer-service";
import {
  getPosOfferScopeBySlug,
  getPosOfferTypeBySlug,
  isPosOfferStatus,
} from "@/lib/services/pos/pos-offer-contract";

const OFFER_ROLES = ["OWNER", "ADMIN", "FINANCE", "INVENTORY"];

function requestError(error: unknown, fallback: string) {
  if (error instanceof PosOfferNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof PosOfferValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PosOfferConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "You do not have permission to manage offers for this organization." }, { status: 403 });
  }
  console.error("POS offer detail request failed", { operation: fallback });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function optionalText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new PosOfferValidationError(`${key} must be a text value.`);
  }
  return value;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; offerId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, offerId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, OFFER_ROLES);
    await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_OFFERS");
    if (!offerId || offerId.length > 100) {
      throw new PosOfferValidationError("Select a valid POS offer.");
    }
    return NextResponse.json({ offer: await getPosOffer(organization.id, offerId) });
  } catch (error) {
    return requestError(error, "Unable to load POS offer.");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; offerId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, offerId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, OFFER_ROLES);
    await requireOrganizationPermission(user.id, organization.id, "MANAGE_POS_OFFERS");
    if (!offerId || offerId.length > 100) {
      throw new PosOfferValidationError("Select a valid POS offer.");
    }
    const body = await request.json().catch(() => {
      throw new PosOfferValidationError("Offer details must be valid JSON.");
    }) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new PosOfferValidationError("Offer details must be sent as an object.");
    }
    const record = body as Record<string, unknown>;
    const offerType = typeof record.offerType === "string" ? getPosOfferTypeBySlug(record.offerType) : undefined;
    const scope = typeof record.scope === "string" ? getPosOfferScopeBySlug(record.scope) : undefined;
    const status = typeof record.status === "string" ? record.status : "";
    if (!offerType) throw new PosOfferValidationError("Select a valid offer type.");
    if (!scope) throw new PosOfferValidationError("Select a valid offer scope.");
    if (!isPosOfferStatus(status)) throw new PosOfferValidationError("Select a valid offer status.");
    if (record.targetIds !== undefined
      && (!Array.isArray(record.targetIds) || !record.targetIds.every((id) => typeof id === "string"))) {
      throw new PosOfferValidationError("Offer targets must be a list of IDs.");
    }

    const offer = await updatePosOffer({
      organizationId: organization.id,
      actorId: user.id,
      offerId,
      offerCode: typeof record.offerCode === "string" ? record.offerCode : "",
      name: typeof record.name === "string" ? record.name : "",
      description: optionalText(record, "description"),
      offerType: offerType.value as PosOfferType,
      scope: scope.value as PosOfferScope,
      status: status as PosOfferStatus,
      discountAmount: optionalText(record, "discountAmount"),
      discountPercentage: optionalText(record, "discountPercentage"),
      buyQuantity: optionalText(record, "buyQuantity"),
      getQuantity: optionalText(record, "getQuantity"),
      getDiscountPercentage: optionalText(record, "getDiscountPercentage"),
      comboPrice: optionalText(record, "comboPrice"),
      startsAt: typeof record.startsAt === "string" ? record.startsAt : "",
      endsAt: optionalText(record, "endsAt"),
      targetIds: Array.isArray(record.targetIds) ? record.targetIds as string[] : [],
    });
    return NextResponse.json({ offer });
  } catch (error) {
    return requestError(error, "Unable to update POS offer.");
  }
}
