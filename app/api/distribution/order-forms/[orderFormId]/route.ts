import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { getDistributionOrderFormPdfData } from "@/lib/services/distribution/order-form-pdf-data-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ orderFormId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const organization = await requireOrganizationContext(
      user.id,
      url.searchParams.get("organizationId") ?? "",
    );
    const { orderFormId } = await context.params;
    return NextResponse.json(await getDistributionOrderFormPdfData(organization.id, orderFormId));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "Order Form PDF data is unavailable until its database schema is current." }, { status: 503 });
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to load Order Form PDF because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Order Form PDF data." },
      { status: 400 },
    );
  }
}
