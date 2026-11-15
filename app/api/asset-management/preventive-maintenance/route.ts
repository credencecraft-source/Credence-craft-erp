import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  completeMaintenanceWorkOrder,
  createPreventiveMaintenancePlan,
  generateDueMaintenanceWorkOrders,
  getPreventiveMaintenanceDashboard,
  PreventiveMaintenanceError,
  registerMaintenanceAsset,
  updateMaintenanceChecklistItem,
} from "@/lib/services/asset-management/preventive-maintenance-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function failureResponse(error: unknown, fallback: string) {
  if (error instanceof PreventiveMaintenanceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && (
    error.message.startsWith("Access denied:")
    || error.message.startsWith("This organization's trial has ended.")
  )) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "This asset tag, plan, or scheduled work order already exists." }, { status: 409 });
    if (error.code === "P2034") return NextResponse.json({ error: "The maintenance record changed at the same time. Reload and try again." }, { status: 409 });
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Preventive Maintenance is unavailable until its database migration is deployed." }, { status: 503 });
    }
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  const user = await requireSessionUser();
  try {
    const organization = await requireOrganizationContext(
      user.id,
      new URL(request.url).searchParams.get("organizationId") ?? "",
    );
    return NextResponse.json(await getPreventiveMaintenanceDashboard(organization.id, user.id));
  } catch (error) {
    return failureResponse(error, "Unable to load Preventive Maintenance.");
  }
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  try {
    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    const body = parsedBody as Record<string, unknown>;
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
    );
    const action = String(body.action ?? "");
    let result: unknown;
    switch (action) {
      case "register-asset":
        result = await registerMaintenanceAsset(organization.id, user.id, {
          assetTag: body.assetTag,
          masterRawMaterialId: body.masterRawMaterialId,
          locationId: body.locationId,
          serialNumber: body.serialNumber,
          criticality: body.criticality,
        });
        break;
      case "create-plan":
        result = await createPreventiveMaintenancePlan(organization.id, user.id, {
          assetId: body.assetId,
          name: body.name,
          intervalDays: body.intervalDays,
          nextDueDate: body.nextDueDate,
          checklist: body.checklist,
        });
        break;
      case "generate-due":
        result = await generateDueMaintenanceWorkOrders(organization.id, user.id);
        break;
      case "update-checklist":
        result = await updateMaintenanceChecklistItem(organization.id, user.id, {
          workOrderId: body.workOrderId,
          checklistItemId: body.checklistItemId,
          completed: body.completed,
          note: body.note,
        });
        break;
      case "complete-work-order":
        result = await completeMaintenanceWorkOrder(
          organization.id,
          user.id,
          user.full_name || user.email || "USER",
          {
            workOrderId: body.workOrderId,
            downtimeMinutes: body.downtimeMinutes,
            completionNotes: body.completionNotes,
          },
        );
        break;
      default:
        return NextResponse.json({ error: "Choose a valid Preventive Maintenance action." }, { status: 400 });
    }
    return NextResponse.json(result, { status: action === "register-asset" || action === "create-plan" ? 201 : 200 });
  } catch (error) {
    return failureResponse(error, "Unable to save Preventive Maintenance.");
  }
}
