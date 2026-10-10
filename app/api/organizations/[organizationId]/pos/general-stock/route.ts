import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId);
    const stockId = new URL(request.url).searchParams.get("stockId")?.trim();
    const stockRecords = await prisma.finishedGoodsGeneralStockReceipt.findMany({
      where: {
        organization_id: organization.id,
        current_stock: { gt: 0 },
        ...(stockId ? { id: stockId } : {}),
      },
      select: {
        id: true,
        style_name: true,
        order_no: true,
        article_no: true,
        brand: true,
        size: true,
        colour: true,
        product_category: true,
        current_stock: true,
        quantity_in: true,
        quantity_out: true,
        posted_at: true,
        created_by: true,
        location: { select: { location_name: true } },
      },
      orderBy: [{ posted_at: "desc" }, { id: "desc" }],
    });

    if (stockId && stockRecords.length === 0) {
      return NextResponse.json({ error: "No available General finished-goods stock found for this record." }, { status: 404 });
    }

    return NextResponse.json({
      records: stockRecords.map((record) => ({
        id: record.id,
        style_name: record.style_name,
        order_no: record.order_no,
        article_no: record.article_no ?? "",
        sku_code: null,
        barcode: null,
        brand: record.brand,
        size: record.size,
        colour: record.colour,
        product_category: record.product_category,
        sub_product_category: null,
        current_stock: record.current_stock,
        location_name: record.location.location_name,
        added_time: record.posted_at,
        added_user: "Verified Work Order GRN",
        source: "WORK_ORDER_GRN",
        qty_in: record.quantity_in,
        qty_out: record.quantity_out,
        gst_rate: null,
        hsn_code: null,
        purchase_price: null,
        sales_price: null,
        mrp: null,
        inventory_bucket: "GENERAL" as const,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load General finished-goods stock." },
      { status: 400 },
    );
  }
}
