import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  getDistributionQuotation,
  saveDistributionQuotationDraft,
} from "@/lib/services/distribution/quotation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ quotationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const organization = await requireOrganizationContext(
      user.id,
      new URL(request.url).searchParams.get("organizationId") ?? "",
    );
    const { quotationId } = await context.params;
    return NextResponse.json(await getDistributionQuotation(organization.id, quotationId));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "Distribution Quotations are unavailable until their database migration is deployed." }, { status: 503 });
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to load distribution quotation because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the distribution quotation." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Submit valid quotation header and detail values.");
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    if (!Array.isArray(body.lines)) throw new Error("Submit quotation detail lines.");
    if (typeof body.quotationDate !== "string" ||
        typeof body.validUntil !== "string" ||
        typeof body.notes !== "string") {
      throw new Error("Submit a quotation date, validity date, and notes as text values.");
    }
    const lines = body.lines.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each quotation detail line must be valid.");
      const line = value as Record<string, unknown>;
      if (typeof line.id !== "string" || typeof line.unitPrice !== "string") {
        throw new Error("Each quotation detail line needs its ID and unit price.");
      }
      return { id: line.id, unitPrice: line.unitPrice };
    });
    const { quotationId } = await context.params;
    const quotation = await saveDistributionQuotationDraft(organization.id, user.id, quotationId, {
      quotationDate: body.quotationDate,
      validUntil: body.validUntil,
      notes: body.notes,
      lines,
    });
    return NextResponse.json({ quotation });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021" || error.code === "P2022") {
        return NextResponse.json({ error: "Distribution Quotations are unavailable until their database migration is deployed." }, { status: 503 });
      }
      if (error.code === "P2002" || error.code === "P2034") {
        return NextResponse.json({ error: "Quotation or booking data changed while saving. Reload and try again." }, { status: 409 });
      }
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to save distribution quotation because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the distribution quotation." },
      { status: 400 },
    );
  }
}
