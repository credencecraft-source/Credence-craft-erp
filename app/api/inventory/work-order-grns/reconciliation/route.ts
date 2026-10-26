import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { reconcileSelectedWorkOrderGrns } from "@/lib/services/inventory/work-order-grn-reconciliation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit a valid Work Order GRN reconciliation request.");
    }
    if (!Array.isArray(body.grnIds) || body.grnIds.length < 1 || body.grnIds.length > 100) {
      throw new Error("Select between 1 and 100 Work Order GRNs to reconcile.");
    }
    if (body.grnIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new Error("Selected Work Order GRN IDs are invalid.");
    }
    if (body.action !== "preview" && body.action !== "apply") {
      throw new Error("Choose preview or apply for GRN reconciliation.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    const result = await reconcileSelectedWorkOrderGrns(
      organization.id,
      user.id,
      body.grnIds as string[],
      body.action === "apply",
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021" || error.code === "P2022") {
        return NextResponse.json({ error: "Work Order GRN reconciliation is unavailable until its database migration is deployed." }, { status: 503 });
      }
      if (error.code === "P2002" || error.code === "P2034") {
        return NextResponse.json({ error: "Work Order GRN stock changed during reconciliation. Reload and try again." }, { status: 409 });
      }
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to reconcile Work Order GRNs because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reconcile Work Order GRNs." },
      { status: 400 },
    );
  }
}
