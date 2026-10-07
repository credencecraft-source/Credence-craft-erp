import { describe, expect, it } from "vitest";

import { flattenWorkOrderGrnVerificationTasks } from "./work-order-grn-verification";

describe("flattenWorkOrderGrnVerificationTasks", () => {
  it("creates one separately identifiable verification task for every GRN size line", () => {
    const tasks = flattenWorkOrderGrnVerificationTasks([{
      id: "grn-1",
      grnNo: "FGRN-1",
      receivedDate: "2026-10-07",
      status: "PENDING_VERIFICATION",
      workOrder: {
        workOrderNo: "WO-1",
        orderNo: "ORD-1",
        styleName: "Style 1",
        article: "Article 1",
      },
      lines: ["S", "M", "L", "XL", "XXL"].map((size, index) => ({
        id: `line-${index + 1}`,
        size,
        buyerSize: size,
        orderedQuantity: 500,
        availableQuantity: 500,
        receivedQuantity: 10 + index,
        verifiedActualQuantity: null,
      })),
    }]);

    expect(tasks).toHaveLength(5);
    expect(tasks.map((task) => task.id)).toEqual([
      "line-1",
      "line-2",
      "line-3",
      "line-4",
      "line-5",
    ]);
    expect(tasks[2]).toMatchObject({
      grnId: "grn-1",
      grnNo: "FGRN-1",
      workOrderNo: "WO-1",
      size: "L",
      orderedQuantity: 500,
      receivedQuantity: 12,
    });
  });

  it("omits already verified lines while other lines on the GRN remain pending", () => {
    const tasks = flattenWorkOrderGrnVerificationTasks([{
      id: "grn-1",
      grnNo: "FGRN-1",
      receivedDate: "2026-10-07",
      status: "PENDING_VERIFICATION",
      workOrder: { workOrderNo: "WO-1", orderNo: "ORD-1", styleName: null, article: null },
      lines: [
        { id: "line-verified", size: "S", buyerSize: "S", orderedQuantity: 10, availableQuantity: 10, receivedQuantity: 4, verifiedActualQuantity: 4 },
        { id: "line-pending", size: "M", buyerSize: "M", orderedQuantity: 10, availableQuantity: 10, receivedQuantity: 3, verifiedActualQuantity: null },
      ],
    }]);

    expect(tasks.map((task) => task.id)).toEqual(["line-pending"]);
  });
});
