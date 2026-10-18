import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createPurchaseRecord, deletePurchaseRecords, listPurchaseRecords, updatePurchaseRecord } from "@/lib/services/pos/purchase-bill-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING"]);
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get("recordId")?.trim();
    const rawLimit = searchParams.get("limit");
    const rawOffset = searchParams.get("offset");
    if (rawLimit !== null || rawOffset !== null) {
      const limit = rawLimit === null ? 100 : Number(rawLimit);
      const offset = rawOffset === null ? 0 : Number(rawOffset);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100
        || !Number.isSafeInteger(offset) || offset < 0) {
        return NextResponse.json({ error: "Purchase record pagination is invalid." }, { status: 400 });
      }
      return NextResponse.json({
        records: await listPurchaseRecords(organization.id, recordId || undefined, { skip: offset, take: limit }),
      });
    }
    return NextResponse.json({ records: await listPurchaseRecords(organization.id, recordId || undefined) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load purchase records." }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING"]);
    const body = await request.json() as Record<string, unknown>;
    const record = await createPurchaseRecord(organization.id, user.id, {
      itemType: body.itemType === "RAW_MATERIAL" ? "RAW_MATERIAL" : "FINISHED_GOODS",
      styleName: body.styleName === null ? null : String(body.styleName ?? ""),
      brandId: body.brandId ? String(body.brandId) : null,
      sizeGroupId: body.sizeGroupId ? String(body.sizeGroupId) : null,
      colorId: body.colorId ? String(body.colorId) : null,
      categoryId: body.categoryId ? String(body.categoryId) : null,
      subCategoryId: body.subCategoryId ? String(body.subCategoryId) : null,
      lines: Array.isArray(body.lines) ? body.lines.map((line) => {
        const value = line as Record<string, unknown>;
        return {
          itemName: value.itemName === null ? null : String(value.itemName ?? ""),
          size: value.size === null ? null : String(value.size ?? ""),
          quantity: String(value.quantity ?? ""),
          purchasePrice: value.purchasePrice === null ? null : String(value.purchasePrice ?? ""),
          salesPrice: value.salesPrice === null ? null : String(value.salesPrice ?? ""),
          gstId: value.gstId ? String(value.gstId) : null,
          hsnCode: value.hsnCode ? String(value.hsnCode) : null,
        };
      }) : [],
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save purchase record." }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING"]);
    const body = await request.json() as Record<string, unknown>;
    const recordId = String(body.recordId ?? "");
    if (!recordId) return NextResponse.json({ error: "Record ID is required." }, { status: 400 });
    const record = await updatePurchaseRecord(organization.id, user.id, recordId, {
      itemType: body.itemType === "RAW_MATERIAL" ? "RAW_MATERIAL" : "FINISHED_GOODS",
      styleName: body.styleName === null ? null : String(body.styleName ?? ""),
      brandId: body.brandId ? String(body.brandId) : null,
      sizeGroupId: body.sizeGroupId ? String(body.sizeGroupId) : null,
      colorId: body.colorId ? String(body.colorId) : null,
      categoryId: body.categoryId ? String(body.categoryId) : null,
      subCategoryId: body.subCategoryId ? String(body.subCategoryId) : null,
      lines: Array.isArray(body.lines) ? body.lines.map((line) => {
        const value = line as Record<string, unknown>;
        return {
          itemName: value.itemName === null ? null : String(value.itemName ?? ""),
          size: value.size === null ? null : String(value.size ?? ""),
          quantity: String(value.quantity ?? ""),
          purchasePrice: value.purchasePrice === null ? null : String(value.purchasePrice ?? ""),
          salesPrice: value.salesPrice === null ? null : String(value.salesPrice ?? ""),
          gstId: value.gstId ? String(value.gstId) : null,
          hsnCode: value.hsnCode ? String(value.hsnCode) : null,
        };
      }) : [],
    });
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update purchase record." }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING"]);
    const body = await request.json() as { recordIds?: unknown };
    const recordIds = Array.isArray(body.recordIds) ? body.recordIds.map(String) : [];
    return NextResponse.json(await deletePurchaseRecords(organization.id, user.id, recordIds));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete purchase records." }, { status: 400 });
  }
}
