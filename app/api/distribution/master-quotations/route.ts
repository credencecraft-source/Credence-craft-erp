import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { createDistributionMasterQuotations } from "@/lib/services/distribution/quotation-service";
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
      throw new Error("Select regular quotations to create a sales order.");
    }
    const vendorId = typeof body.vendorId === "string" && body.vendorId.trim() ? body.vendorId.trim() : null;
    const contactId = typeof body.contactId === "string" && body.contactId.trim() ? body.contactId.trim() : null;
    if (vendorId && contactId) {
      throw new Error("Select either a Vendor Master vendor or a Contact Master contact for the sales order.");
    }
    const quotations = await createDistributionMasterQuotations(
      organization.id,
      user.id,
      body.quotationIds,
      vendorId,
      contactId,
    );
    if (!quotations) {
      return NextResponse.json({ requiresCounterpartySelection: true });
    }
    return NextResponse.json({ quotations }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2021", "P2022"].includes(error.code)) {
        return NextResponse.json({ error: "Sales Order creation is unavailable until the required database migrations are deployed." }, { status: 503 });
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
      { error: error instanceof Error ? error.message : "Unable to create the sales order." },
      { status: 400 },
    );
  }
}
