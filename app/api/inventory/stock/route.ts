import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const organization = await requireOrganizationContext(user.id, url.searchParams.get("organizationId") ?? "");
    const type = url.searchParams.get("type") === "FG" ? "FG" : "RM";
    const stock = type === "FG"
      ? await prisma.finishedGoodsStock.findMany({ where: { organization_id: organization.id }, orderBy: [{ warehouse: "asc" }, { style_name: "asc" }] })
      : await prisma.rawMaterialStock.findMany({ where: { organization_id: organization.id }, orderBy: [{ warehouse: "asc" }, { raw_material: "asc" }] });
    return NextResponse.json({ type, stock });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load stock." }, { status: 400 });
  }
}