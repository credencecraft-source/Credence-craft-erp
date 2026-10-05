import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import {
  acceptShopFloorTransfer,
  assignWorkToBatch,
  createShopFloorTransfer,
  listShopFloorBoard,
  updateProcessLogStatus,
} from "@/lib/services/factory/shop-floor-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const params = new URL(request.url).searchParams;
    const organizationId = params.get("organizationId") ?? "";
    const workOrderId = params.get("workOrderId")?.trim() || undefined;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const board = await listShopFloorBoard(organization.id, workOrderId, user.id);
    return NextResponse.json(board);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the shop-floor board." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json()) as {
      organizationId?: string;
      action?: string;
      workOrderId?: string;
      processId?: string;
      logId?: string;
      transferId?: string;
      quantity?: number | string;
      laborerName?: string;
      contractorName?: string;
    };

    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const action = String(body.action ?? "").trim();

    if (action === "assign") {
      const quantity = Number(body.quantity ?? 0);
      if (!body.workOrderId || !body.processId) throw new Error("Select a work order and process before assigning quantity.");
      const result = await assignWorkToBatch(
        organization.id,
        body.workOrderId,
        body.processId,
        quantity,
        user.id,
        {
          contractorName: body.contractorName,
          laborerName: body.laborerName,
        },
      );
      return NextResponse.json({ success: true, result });
    }

    if (action === "scan") {
      if (!body.logId) throw new Error("A floor log is required before the batch is started.");
      const updated = await updateProcessLogStatus(organization.id, body.logId, "IN_PROGRESS", user.id);
      return NextResponse.json({ success: true, result: updated });
    }

    if (action === "complete") {
      if (!body.logId) throw new Error("A floor log is required before completing it.");
      const updated = await updateProcessLogStatus(organization.id, body.logId, "COMPLETED", user.id);
      return NextResponse.json({ success: true, result: updated });
    }

    if (action === "transfer") {
      if (!body.workOrderId || !body.logId) throw new Error("A work order and completed log are required to transfer stock.");
      const result = await createShopFloorTransfer(organization.id, body.workOrderId, body.logId, user.id);
      return NextResponse.json({ success: true, result });
    }

    if (action === "accept-transfer") {
      if (!body.transferId) throw new Error("Select a transfer before accepting it.");
      const result = await acceptShopFloorTransfer(organization.id, body.transferId, user.id);
      return NextResponse.json({ success: true, result });
    }

    throw new Error("Select a valid shop-floor action.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the shop-floor board." }, { status: 400 });
  }
}
