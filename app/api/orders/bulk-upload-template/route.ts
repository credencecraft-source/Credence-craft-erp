import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { createSelectedOrdersWorkbook, SelectedOrdersWorkbookError } from "@/lib/services/orders/selected-orders-workbook-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user.workspace_id) {
    return NextResponse.json({ error: "Unauthorized user workspace." }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const workspaceId = url.searchParams.get("workspaceId");
  if (!organizationId || !workspaceId) {
    return NextResponse.json({ error: "Organization and workspace are required." }, { status: 400 });
  }
  if (workspaceId !== user.workspace_id) {
    return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid order selection is required." }, { status: 400 });
  }
  const orderIds = typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).orderIds
    : undefined;
  if (!Array.isArray(orderIds) || orderIds.some((id) => typeof id !== "string" || id.trim().length === 0 || id.length > 100)) {
    return NextResponse.json({ error: "Order ids must be a list of valid identifiers." }, { status: 400 });
  }

  try {
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const workbook = await createSelectedOrdersWorkbook(organization.id, orderIds);
    const workbookBody = new Uint8Array(workbook);
    return new NextResponse(workbookBody, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="selected-orders-bulk-upload-editable-v2.xlsx"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof SelectedOrdersWorkbookError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    if (error instanceof Error && error.message.toLowerCase().includes("access denied")) {
      return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
    }
    console.error("Unable to create selected-order workbook", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to create the selected-order workbook." }, { status: 500 });
  }
}
