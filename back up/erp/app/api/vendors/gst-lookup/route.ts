import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/bootstrap/prisma";
import {
  fetchGstDetails,
  isValidGstNumber,
  normalizeGstNumber,
} from "../../../lib/vendors";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  const gstNumber =
    typeof body.gstNumber === "string" ? normalizeGstNumber(body.gstNumber) : "";

  if (!tenantId) {
    return NextResponse.json({ error: "Entity Name is required" }, { status: 400 });
  }
  if (!isValidGstNumber(gstNumber)) {
    return NextResponse.json(
      { error: "Enter a valid 15-character GST number" },
      { status: 400 }
    );
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  const usage = await prisma.gstFetchUsage.upsert({
    where: { tenantId_dateKey: { tenantId, dateKey } },
    create: { tenantId, dateKey },
    update: {},
  });
  if (usage.fetchCount >= 5) {
    return NextResponse.json(
      { error: "Daily GST fetch limit (5) reached" },
      { status: 429 }
    );
  }

  try {
    const details = await fetchGstDetails(gstNumber);
    await prisma.gstFetchUsage.update({
      where: { id: usage.id },
      data: { fetchCount: { increment: 1 } },
    });
    return NextResponse.json({ ...details, fetchCount: usage.fetchCount + 1 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GST lookup failed" },
      { status: 502 }
    );
  }
}
