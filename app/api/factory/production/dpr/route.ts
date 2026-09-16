import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { prisma } from "@/lib/database/prisma-client";

function dayRange(value: string | null) {
  const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Report date is invalid.");
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { start, end: new Date(start.getTime() + 86400000) };
}

async function buildReport(organizationId: string, reportDate: string | null, processName: string | null = null) {
  const { start, end } = dayRange(reportDate);
  const transferDateFilter = reportDate ? { created_at: { gte: start, lt: end } } : {};
  const grnDateFilter = reportDate ? { grn_date: { gte: start, lt: end } } : {};
  const transfers = await prisma.factoryBundleTransfer.findMany({
      where: { organization_id: organizationId, ...transferDateFilter, ...(processName ? { fromProcess: { process_name: processName } } : {}) },
      include: { fromProcess: true, toProcess: true, workOrder: true },
      orderBy: { created_at: "asc" },
    });
  const grns = await prisma.factoryGrn.findMany({
    where: { organization_id: organizationId, ...grnDateFilter, ...(processName ? { fromProcess: { process_name: processName } } : {}) },
    include: { lines: true, fromProcess: true, toProcess: true, workOrder: true },
    orderBy: { created_at: "asc" },
  });
  const processRecords = await prisma.workOrderProcessControllerProcess.findMany({
    where: { controller: { orderController: { order: { organization_id: organizationId } } } },
    select: { process_name: true },
    distinct: ["process_name"],
    orderBy: { process_name: "asc" },
  });
  const allGrns = await prisma.factoryGrn.findMany({
    where: { organization_id: organizationId },
    select: { grn_date: true, received_qty: true, fromProcess: { select: { process_name: true } }, lines: { select: { actual_made_qty: true } } },
    orderBy: { grn_date: "desc" },
  });
  const processCards = processRecords.map((process) => {
    const dates = new Map<string, { grnCount: number; receivedQty: number; actualMade: number }>();
    for (const grn of allGrns.filter((item) => item.fromProcess.process_name === process.process_name)) {
      const date = grn.grn_date.toISOString().slice(0, 10);
      const current = dates.get(date) ?? { grnCount: 0, receivedQty: 0, actualMade: 0 };
      current.grnCount += 1;
      current.receivedQty += grn.received_qty;
      current.actualMade += grn.lines.reduce((sum, line) => sum + line.actual_made_qty, 0);
      dates.set(date, current);
    }
    if (!dates.has(start.toISOString().slice(0, 10))) dates.set(start.toISOString().slice(0, 10), { grnCount: 0, receivedQty: 0, actualMade: 0 });
    return { processName: process.process_name, dates: [...dates.entries()].map(([date, summary]) => ({ date, ...summary })) };
  });
  return { start, transfers, grns, processCards };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const params = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, params.get("organizationId") ?? "");
    const processName = params.get("process")?.trim() || null;
    const { start, transfers, grns, processCards } = await buildReport(organization.id, params.get("date"), processName);
    const report = await prisma.factoryDailyProductionReport.findUnique({ where: { organization_id_report_date: { organization_id: organization.id, report_date: start } }, include: { lines: true } });
    return NextResponse.json({ report, activity: { transfers, grns, processCards }, process: processName, reportDate: start.toISOString().slice(0, 10) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load DPR." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as { organizationId?: string; date?: string; action?: "GENERATE" | "SUBMIT" | "APPROVE" | "REJECT"; rejectionReason?: string };
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const { start, transfers, grns } = await buildReport(organization.id, body.date ?? new Date().toISOString().slice(0, 10));
    const action = body.action ?? "GENERATE";
    const existing = await prisma.factoryDailyProductionReport.findUnique({ where: { organization_id_report_date: { organization_id: organization.id, report_date: start } } });
    if (existing?.status === "APPROVED") throw new Error("This DPR is approved and locked.");
    if (action === "APPROVE" || action === "REJECT" || action === "SUBMIT") {
      if (!existing) throw new Error("Generate the DPR before changing its status.");
      if (action === "SUBMIT" && existing.status !== "DRAFT") throw new Error("Only a draft DPR can be submitted.");
      if (action === "APPROVE" && existing.status !== "SUBMITTED") throw new Error("Only a submitted DPR can be approved.");
      const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "SUBMITTED";
      const report = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.factoryDailyProductionReport.update({ where: { id: existing.id }, data: { status, submitted_at: status === "SUBMITTED" ? new Date() : existing.submitted_at, approved_at: status === "APPROVED" ? new Date() : null, approved_by: status === "APPROVED" ? (user.full_name || user.email) : null, rejection_reason: status === "REJECTED" ? String(body.rejectionReason ?? "").trim() || "Rejected by management." : null } });
        if (action === "APPROVE" || action === "REJECT") {
          await transaction.factoryGrn.updateMany({ where: { organization_id: organization.id, grn_date: { gte: start, lt: new Date(start.getTime() + 86400000) } }, data: { status: action === "APPROVE" ? "APPROVED" : "REJECTED", approved_by: action === "APPROVE" ? (user.full_name || user.email) : null, approved_at: action === "APPROVE" ? new Date() : null } });
        }
        return updated;
      }, { maxWait: 10000, timeout: 30000 });
      return NextResponse.json({ ok: true, report });
    }
    const report = await prisma.$transaction(async (transaction) => {
      const created = await transaction.factoryDailyProductionReport.upsert({ where: { organization_id_report_date: { organization_id: organization.id, report_date: start } }, update: { status: "DRAFT", total_produced: grns.reduce((sum, grn) => sum + grn.lines.reduce((lineSum, line) => lineSum + line.actual_made_qty, 0), 0), total_transferred: transfers.reduce((sum, item) => sum + item.issued_qty, 0), total_received: grns.reduce((sum, item) => sum + item.received_qty, 0) }, create: { organization_id: organization.id, report_date: start, total_produced: grns.reduce((sum, grn) => sum + grn.lines.reduce((lineSum, line) => lineSum + line.actual_made_qty, 0), 0), total_transferred: transfers.reduce((sum, item) => sum + item.issued_qty, 0), total_received: grns.reduce((sum, item) => sum + item.received_qty, 0) } });
      await transaction.factoryDailyProductionReportLine.deleteMany({ where: { report_id: created.id } });
      const reportLines = grns.flatMap((grn) => grn.lines.map((line) => ({
        report_id: created.id,
        work_order_id: grn.work_order_id,
        process_name: grn.fromProcess.process_name,
        operation_name: line.operation_name,
        bundle_transfer_id: grn.bundle_transfer_id,
        grn_id: grn.id,
        grn_line_id: line.id,
        grn_reference: grn.grn_no,
        produced_qty: line.actual_made_qty,
        actual_made_qty: line.actual_made_qty,
        received_qty: line.received_qty,
        labor_mode: line.billable ? "BILLABLE" : "NON_BILLABLE",
        labor_rate: line.actual_price,
        vendor_name: line.vendor_name,
        employee_name: line.employee_name,
        remarks: line.remarks,
      })));
      await transaction.factoryDailyProductionReportLine.createMany({ data: reportLines });
      return transaction.factoryDailyProductionReport.findUnique({ where: { id: created.id }, include: { lines: true } });
    }, { maxWait: 10000, timeout: 30000 });
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate DPR." }, { status: 400 });
  }
}
