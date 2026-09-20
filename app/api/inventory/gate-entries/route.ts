import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
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

    const entry = await prisma.$transaction(async (transaction) => transaction.gateEntry.create({
      data: {
        organization_id: organization.id,
        purchase_order_id: purchaseOrder?.id,
        entry_no: await reserveChallanNumber(organization.id, "GATE_ENTRY", transaction),
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
    }));
    return NextResponse.json({
      ok: true,
      entry,
      nextStep: movementType === "CHALLAN" ? "INVENTORY_RECEIVING" : "SECURITY_HANDOFF",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save gate entry." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const organizationId = text(searchParams.get("organizationId") || body.organizationId);
    const organization = await requireOrganizationContext(user.id, organizationId);
    const rawIds = Array.isArray(body.entryIds) ? body.entryIds : Array.isArray(body.ids) ? body.ids : [];
    const entryIds = rawIds.map((id) => String(id).trim()).filter(Boolean);

    if (entryIds.length === 0) {
      return NextResponse.json({ error: "Select at least one gate entry to delete." }, { status: 400 });
    }

    const result = await prisma.gateEntry.deleteMany({
      where: {
        organization_id: organization.id,
        id: { in: entryIds },
      },
    });

    return NextResponse.json({ ok: true, deletedCount: result.count });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete gate entries." }, { status: 400 });
  }
}