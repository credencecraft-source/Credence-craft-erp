type WorkOrderGrnVerificationSourceLine = {
  id: string;
  size: string | null;
  buyerSize: string | null;
  orderedQuantity: number;
  availableQuantity: number;
  receivedQuantity: number;
  verifiedActualQuantity: number | null;
};

type WorkOrderGrnVerificationSource = {
  id: string;
  grnNo: string;
  receivedDate: string;
  status: string;
  workOrder: {
    workOrderNo: string;
    orderNo: string;
    styleName: string | null;
    article: string | null;
  };
  lines: WorkOrderGrnVerificationSourceLine[];
};

export function flattenWorkOrderGrnVerificationTasks<TLine extends WorkOrderGrnVerificationSourceLine>(
  grns: Array<Omit<WorkOrderGrnVerificationSource, "lines"> & { lines: TLine[] }>,
) {
  return grns.flatMap((grn) => grn.lines
    .filter((line) => line.verifiedActualQuantity === null)
    .map((line) => ({
    id: line.id,
    line,
    grnId: grn.id,
    grnNo: grn.grnNo,
    workOrderNo: grn.workOrder.workOrderNo,
    orderNo: grn.workOrder.orderNo,
    style: grn.workOrder.styleName || grn.workOrder.article || "",
    size: line.size || line.buyerSize || "Unspecified",
    orderedQuantity: line.orderedQuantity,
    receivedQuantity: line.receivedQuantity,
    receivedDate: grn.receivedDate,
    status: grn.status,
    })));
}
