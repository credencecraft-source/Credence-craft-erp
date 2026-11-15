import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { getOrganizationBulkOrderTemplate } from "@/lib/services/orders/bulk-order-template-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> },
) {
  try {
    const { organizationId, moduleKey } = await context.params;
    if (moduleKey !== "order-lookups") {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    const user = await requireSessionUser();
    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const template = await getOrganizationBulkOrderTemplate(organization.id);
    return new NextResponse(Buffer.from(template), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="bulk-order-template.xlsx"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to create bulk order template.", error);
    return NextResponse.json({ error: "Unable to create the Excel template. Please try again." }, { status: 500 });
  }
}
