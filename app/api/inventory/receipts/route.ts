import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type ReceiptLineInput = { purchaseOrderLineId: string; receivedQuantity: number; acceptedQuantity: number; rejectedQuantity: number };

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organization = await requireOrganizationContext(user.id, new URL(request.url).searchParams.get("organizationId") ?? "");
    const receipts = await prisma.inventoryReceipt.findMany({
      where: { organization_id: organization.id },
      include: { purchaseOrder: { select: { purchase_order_no: true, display_no: true } }, lines: true },
      orderBy: { received_date: "desc" },
    });
    return NextResponse.json({ receipts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load inventory receipts." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as { organizationId?: string; purchaseOrderId?: string; warehouse?: string; receivedDate?: string; notes?: string; lines?: ReceiptLineInput[] };
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const purchaseOrderId = String(body.purchaseOrderId ?? "");
    const warehouse = String(body.warehouse ?? "").trim();
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!purchaseOrderId || !warehouse || lines.length === 0) throw new Error("Purchase Order, warehouse, and at least one receipt line are required.");

    const receipt = await prisma.$transaction(async (transaction) => {
      const purchaseOrder = await transaction.purchaseOrder.findFirst({ where: { id: purchaseOrderId, organization_id: organization.id }, include: { lines: true } });
      if (!purchaseOrder) throw new Error("Purchase Order not found in this organization.");
      if (!["APPROVED", "SHARED"].includes(purchaseOrder.status)) throw new Error("Only approved Purchase Orders can be received.");
      const orderLines = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
      const normalized = lines.map((line) => {
        const orderLine = orderLines.get(String(line.purchaseOrderLineId));
        const received = Number(line.receivedQuantity);
        const accepted = Number(line.acceptedQuantity);
        const rejected = Number(line.rejectedQuantity);
        if (!orderLine || !Number.isFinite(received) || received <= 0 || accepted < 0 || rejected < 0 || accepted + rejected !== received) throw new Error("Receipt quantities are invalid for one or more lines.");
        if (received > Number(orderLine.quantity)) throw new Error(`Received quantity exceeds the ordered quantity for ${orderLine.raw_material ?? "the selected item"}.`);
        return { orderLine, received, accepted, rejected };
      });
      const created = await transaction.inventoryReceipt.create({
        data: {
          organization_id: organization.id,
          purchase_order_id: purchaseOrder.id,
          receipt_no: `IR-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
          warehouse,
          received_date: body.receivedDate ? new Date(body.receivedDate) : new Date(),
          received_by: user.full_name || user.email,
          notes: body.notes?.trim() || null,
          lines: { create: normalized.map(({ orderLine, received, accepted, rejected }) => ({ purchase_order_line_id: orderLine.id, raw_material: orderLine.raw_material, ordered_quantity: orderLine.quantity, received_quantity: received, accepted_quantity: accepted, rejected_quantity: rejected })) },
        },
        include: { lines: true },
      });
      for (const { orderLine, accepted } of normalized) {
        if (!orderLine.raw_material || accepted <= 0) continue;
        await transaction.rawMaterialStock.upsert({
          where: { organization_id_raw_material_warehouse: { organization_id: organization.id, raw_material: orderLine.raw_material, warehouse } },
          create: { organization_id: organization.id, raw_material: orderLine.raw_material, warehouse, quantity_on_hand: new Prisma.Decimal(accepted) },
          update: { quantity_on_hand: { increment: new Prisma.Decimal(accepted) } },
        });
      }
      return created;
    });
    return NextResponse.json({ ok: true, receipt }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to post inventory receipt." }, { status: 400 });
  }
}