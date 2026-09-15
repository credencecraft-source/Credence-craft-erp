import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const movementTypes = new Set(["CHALLAN", "VISITOR", "STAFF", "COURIER", "OTHER"]);
const directions = new Set(["INWARD", "OUTWARD"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function purchaseOrderWhere(organizationId: string, purchaseOrderNo: string) {
  const displayMatch = /^PO-(\d+)$/i.exec(purchaseOrderNo);
  return displayMatch
    ? { organization_id: organizationId, OR: [{ purchase_order_no: purchaseOrderNo }, { display_no: Number(displayMatch[1]) }] }
    : { organization_id: organizationId, purchase_order_no: purchaseOrderNo };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    const challanNo = text(searchParams.get("challanNo"));

    if (challanNo) {
      const purchaseOrder = await prisma.purchaseOrder.findFirst({
        where: purchaseOrderWhere(organization.id, challanNo),
        include: { vendor: { select: { vendor: true } }, lines: { select: { raw_material: true, quantity: true, source_order_no: true } } },
      });
      if (!purchaseOrder) return NextResponse.json({ error: "No Purchase Order was found for this challan number." }, { status: 404 });
      const displayChallanNo = purchaseOrder.display_no ? `PO-${purchaseOrder.display_no}` : purchaseOrder.purchase_order_no;
      return NextResponse.json({ challan: { challanNo: displayChallanNo, purchaseOrderId: purchaseOrder.id, vendorName: purchaseOrder.vendor.vendor, lines: purchaseOrder.lines.map((line) => ({ rawMaterial: line.raw_material, quantity: Number(line.quantity), sourceOrderNo: line.source_order_no })) } });
    }

    const entries = await prisma.gateEntry.findMany({
      where: { organization_id: organization.id },
      orderBy: { entry_at: "desc" },
      take: 100,
      include: { purchaseOrder: { select: { purchase_order_no: true } } },
    });
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load gate entries." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organization = await requireOrganizationContext(user.id, text(body.organizationId));
    const direction = text(body.direction).toUpperCase();
    const movementType = text(body.movementType).toUpperCase();
    const personName = text(body.personName);
    if (!directions.has(direction) || !movementTypes.has(movementType) || !personName) throw new Error("Direction, movement type, and person or party name are required.");

    const challanNo = text(body.challanNo);
    const purchaseOrder = challanNo
      ? await prisma.purchaseOrder.findFirst({ where: purchaseOrderWhere(organization.id, challanNo), select: { id: true, purchase_order_no: true, display_no: true } })
      : null;
    if (movementType === "CHALLAN" && !purchaseOrder) throw new Error("A valid challan number is required for challan movement.");

    const result = await prisma.$transaction(async (transaction) => {
      const entry = await transaction.gateEntry.create({
        data: {
          organization_id: organization.id,
          purchase_order_id: purchaseOrder?.id,
          entry_no: `GE-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
          direction,
          movement_type: movementType,
          challan_no: challanNo || (purchaseOrder?.display_no ? `PO-${purchaseOrder.display_no}` : purchaseOrder?.purchase_order_no),
          person_name: personName,
          company_name: text(body.companyName) || null,
          id_type: text(body.idType) || null,
          id_number: text(body.idNumber) || null,
          contact_number: text(body.contactNumber) || null,
          vehicle_number: text(body.vehicleNumber) || null,
          purpose: text(body.purpose) || null,
          item_description: text(body.itemDescription) || null,
          quantity: text(body.quantity) ? Number(body.quantity) : null,
          from_to: text(body.fromTo) || null,
          entry_at: text(body.entryAt) ? new Date(text(body.entryAt)) : new Date(),
          notes: text(body.notes) || null,
          created_by: user.full_name || user.email,
        },
        include: { purchaseOrder: { select: { purchase_order_no: true } } },
      });

      let grn = null;
      if (movementType === "CHALLAN" && purchaseOrder) {
        grn = await transaction.inventoryReceipt.findFirst({ where: { organization_id: organization.id, purchase_order_id: purchaseOrder.id, status: "DRAFT" }, select: { id: true, receipt_no: true } });
        if (!grn) {
          const orderLines = await transaction.purchaseOrderLine.findMany({ where: { purchase_order_id: purchaseOrder.id } });
          grn = await transaction.inventoryReceipt.create({
            data: {
              organization_id: organization.id,
              purchase_order_id: purchaseOrder.id,
              receipt_no: `GRN-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
              status: "DRAFT",
              warehouse: "Main Warehouse",
              received_date: text(body.entryAt) ? new Date(text(body.entryAt)) : new Date(),
              received_by: user.full_name || user.email,
              notes: `Created from Gate Entry ${entry.entry_no}`,
              lines: { create: orderLines.map((line) => ({ purchase_order_line_id: line.id, raw_material: line.raw_material, ordered_quantity: line.quantity, received_quantity: 0, accepted_quantity: 0, rejected_quantity: 0 })) },
            },
            select: { id: true, receipt_no: true },
          });
        }
      }
      return { entry, grn };
    });
    return NextResponse.json({ ok: true, entry: result.entry, grn: result.grn }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save gate entry." }, { status: 400 });
  }
}