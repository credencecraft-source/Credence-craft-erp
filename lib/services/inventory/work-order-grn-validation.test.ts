import { describe, expect, it } from "vitest";

import {
  calculateWorkOrderGrnVerificationSplit,
  normalizeWorkOrderGrnLines,
} from "./work-order-grn-validation";

const sizes = [
  { id: "size-s", size: "S", buyerSize: null, quantity: 20 },
  { id: "size-m", size: "M", buyerSize: null, quantity: 30 },
];

describe("normalizeWorkOrderGrnLines", () => {
  it("accepts size-wise partial receipts and returns remaining balances", () => {
    const result = normalizeWorkOrderGrnLines(
      sizes,
      [{ workOrderSizeLineId: "size-s", receivedQuantity: 4, verifiedActualQuantity: null, approvedQuantity: null }],
      [
        { workOrderSizeLineId: "size-s", receivedQuantity: 6 },
        { workOrderSizeLineId: "size-m", receivedQuantity: 10 },
      ],
    );

    expect(result).toEqual([
      {
        workOrderSizeLineId: "size-s",
        receivedQuantity: 6,
        size: "S",
        buyerSize: null,
        orderedQuantity: 20,
        availableQuantity: 16,
      },
      {
        workOrderSizeLineId: "size-m",
        receivedQuantity: 10,
        size: "M",
        buyerSize: null,
        orderedQuantity: 30,
        availableQuantity: 30,
      },
    ]);
  });

  it("uses approved amounts from completed verification when calculating outstanding quantities", () => {
    const result = normalizeWorkOrderGrnLines(
      [sizes[0]],
      [{ workOrderSizeLineId: "size-s", receivedQuantity: 10, verifiedActualQuantity: 9, approvedQuantity: 7 }],
      [{ workOrderSizeLineId: "size-s", receivedQuantity: 13 }],
    );
    expect(result[0].availableQuantity).toBe(13);
  });

  it("rejects missing, duplicate, foreign, zero-total, and over-balance receipt rows", () => {
    expect(() => normalizeWorkOrderGrnLines(sizes, [], [])).toThrow(/one received quantity/i);
    expect(() => normalizeWorkOrderGrnLines(sizes, [], [
      { workOrderSizeLineId: "size-s", receivedQuantity: 2 },
      { workOrderSizeLineId: "size-s", receivedQuantity: 1 },
    ])).toThrow(/only once/i);
    expect(() => normalizeWorkOrderGrnLines(sizes, [], [
      { workOrderSizeLineId: "size-s", receivedQuantity: 2 },
      { workOrderSizeLineId: "foreign-size", receivedQuantity: 1 },
    ])).toThrow(/belong to this work order/i);
    expect(() => normalizeWorkOrderGrnLines(sizes, [], [
      { workOrderSizeLineId: "size-s", receivedQuantity: 0 },
      { workOrderSizeLineId: "size-m", receivedQuantity: 0 },
    ])).toThrow(/at least one/i);
    expect(() => normalizeWorkOrderGrnLines(sizes, [], [
      { workOrderSizeLineId: "size-s", receivedQuantity: 21 },
      { workOrderSizeLineId: "size-m", receivedQuantity: 0 },
    ])).toThrow(/remaining work-order balance/i);
  });
});

describe("calculateWorkOrderGrnVerificationSplit", () => {
  it("splits actual into approved and rejected and approved into booking and general stock", () => {
    expect(calculateWorkOrderGrnVerificationSplit({
      actualReceivedQuantity: 18,
      approvedQuantity: 15,
      advanceBookedQuantity: 9,
    })).toEqual({
      rejectedQuantity: 3,
      generalInventoryQuantity: 6,
    });
  });

  it("rejects approved quantities greater than actual and booked quantities greater than approved", () => {
    expect(() => calculateWorkOrderGrnVerificationSplit({
      actualReceivedQuantity: 10,
      approvedQuantity: 11,
      advanceBookedQuantity: 0,
    })).toThrow(/cannot exceed actual/i);
    expect(() => calculateWorkOrderGrnVerificationSplit({
      actualReceivedQuantity: 10,
      approvedQuantity: 8,
      advanceBookedQuantity: 9,
    })).toThrow(/cannot exceed approved/i);
  });
});
