import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { createDistributionMasterQuotation } from "@/lib/services/distribution/quotation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Submit valid quotation selection.");
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    if (!Array.isArray(body.quotationIds) || body.quotationIds.some((id) => typeof id !== "string")) {
      throw new Error("Select regular quotations to create a master quotation.");
    }
    const quotation = await createDistributionMasterQuotation(organization.id, user.id, body.quotationIds);
    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2021", "P2022"].includes(error.code)) {
        return NextResponse.json({ error: "Distribution Quotations are unavailable until their database migration is deployed." }, { status: 503 });
      }
      if (["P2002", "P2034"].includes(error.code)) {
        return NextResponse.json({ error: "Quotation data changed while saving. Reload and try again." }, { status: 409 });
      }
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to create distribution master quotation because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the master quotation." },
      { status: 400 },
    );
  }
}
