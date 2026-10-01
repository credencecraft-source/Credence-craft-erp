import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getRmGrnVerification, getRmGrnVerificationDraftsForPurchaseOrder, InvalidActualCountError, listRmGrnVerificationAllocations, MasterGroupRequiredError, RmGrnVerificationNotFoundError, saveRmGrnVerification } from "@/lib/services/inventory/rm-grn-verification-service";
import { getStockVerificationDetails, listPendingStockVerificationTasks, saveStockGroupVerification } from "@/lib/services/inventory/rm-stock-verification-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof RmGrnVerificationNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidActualCountError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof MasterGroupRequiredError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "RM GRN Verification is unavailable until its database migration is deployed." }, { status: 503 });
    }
    if (error.code === "P2002" || error.code === "P2034") {
      return NextResponse.json({ error: "This verification changed while it was being saved. Reload and try again." }, { status: 409 });
    }
  }
  if (error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    if (searchParams.get("verificationRegister") === "true") {
      const stockTasks = await listPendingStockVerificationTasks(organization.id);
      return NextResponse.json({ stockTasks });
    }
    if (searchParams.get("allocationRegister") === "true") {
      const allocations = await listRmGrnVerificationAllocations(organization.id);
      return NextResponse.json({ allocations });
    }

    const purchaseOrderId = searchParams.get("purchaseOrderId") ?? "";
    if (purchaseOrderId) {
      const drafts = await getRmGrnVerificationDraftsForPurchaseOrder(organization.id, purchaseOrderId);
      if (!drafts) return NextResponse.json({ error: "Approved Purchase Order not found." }, { status: 404 });
      return NextResponse.json({ drafts });
    }

    const receiptLineId = searchParams.get("receiptLineId") ?? "";
    const stockGroupedPurchaseOrderId = searchParams.get("stockGroupedPurchaseOrderId") ?? "";
    if (stockGroupedPurchaseOrderId) {
      const verification = await getStockVerificationDetails(organization.id, stockGroupedPurchaseOrderId);
      if (!verification) return NextResponse.json({ error: "Stock verification task not found." }, { status: 404 });
      return NextResponse.json({ verification });
    }
    if (!receiptLineId) return NextResponse.json({ error: "GRN raw-material line is required." }, { status: 400 });

    const verification = await getRmGrnVerification(organization.id, receiptLineId);
    if (!verification) return NextResponse.json({ error: "GRN raw-material line not found." }, { status: 404 });
    return NextResponse.json({ verification });
  } catch (error) {
    return errorResponse(error, "Unable to load RM GRN Verification.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    const receiptLineId = String(body.receiptLineId ?? "").trim();
    const stockGroupedPurchaseOrderId = String(body.sourceGroupedPurchaseOrderId ?? "").trim();
    if (Boolean(receiptLineId) === Boolean(stockGroupedPurchaseOrderId)) {
      return NextResponse.json({ error: "Choose exactly one GRN line or stock verification task." }, { status: 400 });
    }

    if (stockGroupedPurchaseOrderId) {
      const result = await saveStockGroupVerification(
        organization.id,
        stockGroupedPurchaseOrderId,
        { verifiedQuantity: body.verifiedQuantity, approvedQuantity: body.approvedQuantity },
        user.id,
      );
      return NextResponse.json({ verification: result }, { status: 201 });
    }

    const result = await saveRmGrnVerification(
      organization.id,
      receiptLineId,
      {
        verifiedQuantity: body.verifiedQuantity,
        approvedQuantity: body.approvedQuantity,
        allocations: body.allocations,
      },
      user.id,
    );
    return NextResponse.json({ verification: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error, "Unable to save RM GRN Verification.");
  }
}