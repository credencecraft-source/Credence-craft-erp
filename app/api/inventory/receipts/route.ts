import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type ReceiptLineInput = { purchaseOrderLineId: string; receivedQuantity: number; acceptedQuantity: number; rejectedQuantity: number };

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    const purchaseOrderId = searchParams.get("purchaseOrderId");
    const receiptId = searchParams.get("receiptId");
    const receipts = await prisma.inventoryReceipt.findMany({
      where: { organization_id: organization.id, ...(purchaseOrderId ? { purchase_order_id: purchaseOrderId } : {}), ...(receiptId ? { id: receiptId } : {}) },
      include: { purchaseOrder: { select: { id: true, purchase_order_no: true, display_no: true } }, lines: true },
      orderBy: { received_date: "desc" },
    });
    return receiptId || purchaseOrderId ? NextResponse.json({ receipt: receipts[0] ?? null }) : NextResponse.json({ receipts });
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
      const existingLines = await transaction.inventoryReceiptLine.findMany({
        where: { purchase_order_line_id: { in: lines.map((line) => String(line.purchaseOrderLineId)) } },
        select: { purchase_order_line_id: true, received_quantity: true },
      });
      const alreadyReceived = new Map<string, number>();
      for (const line of existingLines) alreadyReceived.set(line.purchase_order_line_id, (alreadyReceived.get(line.purchase_order_line_id) ?? 0) + Number(line.received_quantity));
      const normalized = lines.map((line) => {
        const orderLine = orderLines.get(String(line.purchaseOrderLineId));
        const received = Number(line.receivedQuantity);
        const accepted = Number(line.acceptedQuantity);
        const rejected = Number(line.rejectedQuantity);
        const pending = orderLine ? Number(orderLine.quantity) - (alreadyReceived.get(orderLine.id) ?? 0) : 0;
        if (!orderLine || !Number.isFinite(received) || received <= 0 || accepted < 0 || rejected < 0 || accepted + rejected !== received || received > pending) throw new Error("Receipt quantities exceed the pending Purchase Order quantity or are invalid.");
        return { orderLine, received, accepted, rejected };
      });
      const created = await transaction.inventoryReceipt.create({
        data: {
          organization_id: organization.id,
          purchase_order_id: purchaseOrder.id,
          receipt_no: await reserveChallanNumber(organization.id, "RM_GRN", transaction),
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

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const organizationId = String(searchParams.get("organizationId") ?? body.organizationId ?? "").trim();
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);

    const rawIds = Array.isArray(body.receiptIds)
      ? body.receiptIds
      : Array.isArray(body.ids)
        ? body.ids
        : [];

    const receiptIds = rawIds.map((id) => String(id).trim()).filter(Boolean);
    if (receiptIds.length === 0) {
      return NextResponse.json({ error: "Select at least one GRN record to delete." }, { status: 400 });
    }

    const result = await prisma.inventoryReceipt.deleteMany({
      where: {
        organization_id: organization.id,
        id: { in: receiptIds },
      },
    });

    return NextResponse.json({ ok: true, deletedCount: result.count });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete GRN records." }, { status: 400 });
  }
}