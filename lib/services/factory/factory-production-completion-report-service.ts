import { prisma } from "@/lib/database/prisma-client";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type FactoryProductionCompletionReportOptions = {
  cursor?: string;
  limit?: number;
};

export async function listFactoryProductionCompletionReport(
  organizationId: string,
  options: FactoryProductionCompletionReportOptions = {},
) {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new Error(`Report page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (options.cursor !== undefined && (options.cursor.length === 0 || options.cursor.length > 128)) {
    throw new Error("Report cursor is invalid.");
  }

  const records = await prisma.factoryGrn.findMany({
    where: {
      organization_id: organizationId,
      workOrder: { organization_id: organizationId, order: { organization_id: organizationId } },
      bundleTransfer: { organization_id: organizationId },
    },
    select: {
      id: true,
      grn_no: true,
      created_at: true,
      received_qty: true,
      received_by: true,
      status: true,
      workOrder: {
        select: {
          work_order_no: true,
          order: { select: { orderNo: true, article: true, styleName: true } },
        },
      },
      bundleTransfer: { select: { issued_qty: true } },
      fromProcess: { select: { process_name: true } },
      toProcess: { select: { process_name: true } },
      lines: { select: { operation_name: true, actual_made_qty: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = records.length > limit;
  const page = hasMore ? records.slice(0, limit) : records;
  return {
    records: page.map((record) => ({
      id: record.id,
      grnNo: record.grn_no,
      acceptedAt: record.created_at,
      orderNo: record.workOrder.order.orderNo,
      styleNo: record.workOrder.order.article,
      styleName: record.workOrder.order.styleName,
      workOrderNo: record.workOrder.work_order_no,
      fromProcess: record.fromProcess.process_name,
      toProcess: record.toProcess.process_name,
      transferQty: record.bundleTransfer.issued_qty,
      acceptedQty: record.received_qty,
      acceptedBy: record.received_by,
      status: record.status,
      operations: record.lines.map((line) => `${line.operation_name} (${line.actual_made_qty})`),
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}
