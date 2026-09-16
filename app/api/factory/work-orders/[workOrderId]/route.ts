import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { deleteWorkOrder, updateWorkOrder } from "@/lib/services/factory/work-order-service";

type RouteContext = { params: Promise<{ workOrderId: string }> };

type UpdateBody = {
  organizationId?: string;
  status?: string;
  lines?: Array<{ sourceFinishedGoodsId?: string; quantity?: number | string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as UpdateBody;
    const { workOrderId } = await context.params;
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const workOrder = await updateWorkOrder(organization.id, workOrderId, { status: body.status, lines: Array.isArray(body.lines) ? body.lines : [] });
    return NextResponse.json({ ok: true, workOrder });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update work order." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const { workOrderId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    await deleteWorkOrder(organization.id, workOrderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete work order." }, { status: 400 });
  }
}
