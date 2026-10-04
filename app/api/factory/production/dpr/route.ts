import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function dayRange(value: string | null) {
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Report date must use YYYY-MM-DD format.");
  const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime()) || (value && date.toISOString().slice(0, 10) !== value)) throw new Error("Report date is invalid.");
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { start, end: new Date(start.getTime() + 86400000) };
}

type FactoryDatabase = Prisma.TransactionClient | typeof prisma;

async function buildReport(
  organizationId: string,
  reportDate: string | null,
  processName: string | null = null,
  database: FactoryDatabase = prisma,
  includeProcessCards = true,
) {
  const { start, end } = dayRange(reportDate);
  const transferDateFilter = reportDate ? { created_at: { gte: start, lt: end } } : {};
  const grnDateFilter = reportDate ? { grn_date: { gte: start, lt: end } } : {};
  const transfers = await database.factoryBundleTransfer.findMany({
    where: { organization_id: organizationId, ...transferDateFilter, ...(processName ? { fromProcess: { process_name: processName } } : {}) },
    include: { fromProcess: true, toProcess: true, workOrder: true },
    orderBy: { created_at: "asc" },
  });
  const grns = await database.factoryGrn.findMany({
    where: { organization_id: organizationId, ...grnDateFilter, ...(processName ? { fromProcess: { process_name: processName } } : {}) },
    include: { lines: true, fromProcess: true, toProcess: true, workOrder: true },
    orderBy: { created_at: "asc" },
  });
  if (!includeProcessCards) return { start, transfers, grns, processCards: [] };

  const processRecords = await database.workOrderProcessControllerProcess.findMany({
    where: { controller: { orderController: { order: { organization_id: organizationId } } } },
    select: { process_name: true },
    distinct: ["process_name"],
    orderBy: { process_name: "asc" },
  });
  const allGrns = await database.factoryGrn.findMany({
    where: { organization_id: organizationId },
    select: { grn_date: true, received_qty: true, fromProcess: { select: { process_name: true } }, lines: { select: { actual_made_qty: true } } },
    orderBy: { grn_date: "desc" },
  });
  const processDates = new Map<string, Map<string, { grnCount: number; receivedQty: number; actualMade: number }>>();
  for (const grn of allGrns) {
    const date = grn.grn_date.toISOString().slice(0, 10);
    let dates = processDates.get(grn.fromProcess.process_name);
    if (!dates) {
      dates = new Map();
      processDates.set(grn.fromProcess.process_name, dates);
    }
    const summary = dates.get(date) ?? { grnCount: 0, receivedQty: 0, actualMade: 0 };
    summary.grnCount += 1;
    summary.receivedQty += grn.received_qty;
    summary.actualMade += grn.lines.reduce((sum, line) => sum + line.actual_made_qty, 0);
    dates.set(date, summary);
  }
  const processCards = processRecords.map((process) => {
    const dates = new Map(processDates.get(process.process_name) ?? []);
    const reportDateKey = start.toISOString().slice(0, 10);
    if (!dates.has(reportDateKey)) dates.set(reportDateKey, { grnCount: 0, receivedQty: 0, actualMade: 0 });
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
    const report = await prisma.factoryDailyProductionReport.findUnique({
      where: { organization_id_report_date: { organization_id: organization.id, report_date: start } },
      include: { lines: true },
    });
    return NextResponse.json({ report, activity: { transfers, grns, processCards }, process: processName, reportDate: start.toISOString().slice(0, 10) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load DPR." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as {
      organizationId?: string;
      date?: string;
      action?: "GENERATE" | "SUBMIT" | "APPROVE" | "REJECT";
      rejectionReason?: string;
    };
    const action = body.action ?? "GENERATE";
    if (!["GENERATE", "SUBMIT", "APPROVE", "REJECT"].includes(action)) throw new Error("Select a valid DPR action.");
    const allowedRoles = action === "APPROVE" || action === "REJECT"
      ? ["OWNER", "ADMIN"]
      : ["OWNER", "ADMIN", "MERCHANDISING"];
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), allowedRoles);
    const reportDate = body.date ?? new Date().toISOString().slice(0, 10);
    const { start, end } = dayRange(reportDate);

    if (action === "GENERATE") {
      const report = await prisma.$transaction(async (transaction) => {
        const { transfers, grns } = await buildReport(organization.id, reportDate, null, transaction, false);
        const existing = await transaction.factoryDailyProductionReport.findUnique({
          where: { organization_id_report_date: { organization_id: organization.id, report_date: start } },
        });
        if (existing && existing.status !== "DRAFT") {
          throw new Error("Only a draft DPR can be regenerated. Submitted or decided reports are locked.");
        }
        const totalProduced = grns.reduce((sum, grn) => sum + grn.lines.reduce((lineSum, line) => lineSum + line.actual_made_qty, 0), 0);
        const totalTransferred = transfers.reduce((sum, transfer) => sum + transfer.issued_qty, 0);
        const totalReceived = grns.reduce((sum, grn) => sum + grn.received_qty, 0);
        const totalLaborCost = grns.reduce((sum, grn) => grn.lines.reduce((lineSum, line) => (
          line.billable && line.actual_price
            ? lineSum.plus(line.actual_price.mul(line.actual_made_qty))
            : lineSum
        ), sum), new Prisma.Decimal(0));
        const report = existing
          ? await transaction.factoryDailyProductionReport.update({
            where: { id: existing.id },
            data: { total_produced: totalProduced, total_transferred: totalTransferred, total_received: totalReceived, total_labor_cost: totalLaborCost },
          })
          : await transaction.factoryDailyProductionReport.create({
            data: {
              organization_id: organization.id,
              report_date: start,
              total_produced: totalProduced,
              total_transferred: totalTransferred,
              total_received: totalReceived,
              total_labor_cost: totalLaborCost,
            },
          });
        await transaction.factoryDailyProductionReportLine.deleteMany({ where: { report_id: report.id } });
        const reportLines = grns.flatMap((grn) => grn.lines.map((line) => ({
          report_id: report.id,
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
          labor_amount: line.billable && line.actual_price ? line.actual_price.mul(line.actual_made_qty) : null,
          vendor_name: line.vendor_name,
          employee_name: line.employee_name,
          remarks: line.remarks,
        })));
        if (reportLines.length > 0) await transaction.factoryDailyProductionReportLine.createMany({ data: reportLines });
        await createAuditEvent({
          organizationId: organization.id,
          userId: user.id,
          module: "Factory Management",
          action: "GENERATE_DPR",
          entityType: "FactoryDailyProductionReport",
          entityId: report.id,
          details: { report_date: reportDate, total_produced: totalProduced, total_transferred: totalTransferred, total_received: totalReceived },
        }, transaction);
        return transaction.factoryDailyProductionReport.findUnique({ where: { id: report.id }, include: { lines: true } });
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
      return NextResponse.json({ ok: true, report });
    }

    const report = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.factoryDailyProductionReport.findUnique({
        where: { organization_id_report_date: { organization_id: organization.id, report_date: start } },
      });
      if (!existing) throw new Error("Generate the DPR before changing its status.");
      if (action === "SUBMIT" && existing.status !== "DRAFT") throw new Error("Only a draft DPR can be submitted.");
      if ((action === "APPROVE" || action === "REJECT") && existing.status !== "SUBMITTED") {
        throw new Error("Only a submitted DPR can be approved or rejected.");
      }
      if (action === "APPROVE" && existing.submitted_by_user_id === user.id) {
        throw new Error("The person who submitted a DPR cannot approve it.");
      }
      if (action === "REJECT" && (body.rejectionReason?.trim().length ?? 0) > 1000) {
        throw new Error("Rejection reason cannot exceed 1000 characters.");
      }
      const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "SUBMITTED";
      const now = new Date();
      const updated = await transaction.factoryDailyProductionReport.updateMany({
        where: { id: existing.id, status: existing.status },
        data: {
          status,
          ...(action === "SUBMIT" ? { submitted_at: now, submitted_by_user_id: user.id } : {}),
          ...(action === "APPROVE" ? { approved_at: now, approved_by: user.full_name, approved_by_user_id: user.id } : {}),
          ...(action === "REJECT" ? { approved_at: null, approved_by: null, approved_by_user_id: null, rejection_reason: body.rejectionReason?.trim() || "Rejected by management." } : {}),
        },
      });
      if (updated.count !== 1) throw new Error("DPR status changed concurrently. Refresh the report and retry.");
      if (action === "APPROVE" || action === "REJECT") {
        await transaction.factoryGrn.updateMany({
          where: { organization_id: organization.id, grn_date: { gte: start, lt: end }, status: "DRAFT" },
          data: {
            status: action === "APPROVE" ? "APPROVED" : "REJECTED",
            approved_by: action === "APPROVE" ? user.full_name : null,
            approved_at: action === "APPROVE" ? now : null,
          },
        });
      }
      await createAuditEvent({
        organizationId: organization.id,
        userId: user.id,
        module: "Factory Management",
        action: `${action}_DPR`,
        entityType: "FactoryDailyProductionReport",
        entityId: existing.id,
        details: { report_date: reportDate, status },
      }, transaction);
      return transaction.factoryDailyProductionReport.findUnique({ where: { id: existing.id }, include: { lines: true } });
    }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate DPR." }, { status: 400 });
  }
}
