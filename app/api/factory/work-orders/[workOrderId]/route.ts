import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { deleteWorkOrder, updateWorkOrder } from "@/lib/services/factory/work-order-service";

function errorStatus(error: unknown) {
  return error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400;
}

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
    const organizationId = String(body.organizationId ?? "");
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organizationId, "UPDATE_WORK_ORDERS");
    const workOrder = await updateWorkOrder(organization.id, user.id, workOrderId, {
      status: body.status,
      ...(body.lines !== undefined ? { lines: Array.isArray(body.lines) ? body.lines : [] } : {}),
    });
    return NextResponse.json({ ok: true, workOrder });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update work order." }, { status: errorStatus(error) });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const { workOrderId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organizationId, "DELETE_WORK_ORDERS");
    await deleteWorkOrder(organization.id, user.id, workOrderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete work order." }, { status: errorStatus(error) });
  }
}
