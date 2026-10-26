import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { calculateWorkOrderGrnStockSummary } from "./work-order-grn-service";

const organizationId = "organization-1";

function approvedLine(): Parameters<typeof calculateWorkOrderGrnStockSummary>[0] {
  return {
    approved_quantity: 100,
    advance_booked_quantity: 60,
    general_inventory_quantity: 40,
    generalStockReceipt: {
      id: "general-1",
      organization_id: organizationId,
      quantity_in: 40,
      quantity_out: 15,
      current_stock: 25,
    },
    bookingAllocations: [{
      id: "allocation-1",
      organization_id: organizationId,
      allocated_quantity: 60,
      finishedGoodsStockReceipt: {
        id: "allocated-1",
        organization_id: organizationId,
        grn_allocation_id: "allocation-1",
        quantity_in: 60,
        quantity_out: 20,
        current_stock: 40,
      },
    }],
  };
}

describe("calculateWorkOrderGrnStockSummary", () => {
  it("totals current stock and reports outstanding requests separately from issued", () => {
    const line = approvedLine();
    const requests = new Map([
      ["GENERAL:general-1", [{
        source_stock_type: "GENERAL",
        source_stock_id: "general-1",
        requested_quantity: new Prisma.Decimal(10),
        shipped_quantity: new Prisma.Decimal(2),
        request: { status: "PARTIALLY_SHIPPED" },
      }]],
      ["ALLOCATED:allocated-1", [{
        source_stock_type: "ALLOCATED",
        source_stock_id: "allocated-1",
        requested_quantity: new Prisma.Decimal(12),
        shipped_quantity: new Prisma.Decimal(5),
        request: { status: "PARTIALLY_SHIPPED" },
      }]],
    ]);

    expect(calculateWorkOrderGrnStockSummary(line, organizationId, requests)).toEqual({
      requestedQuantity: 15,
      issuedQuantity: 7,
      generalStockQuantity: 25,
      allocatedStockQuantity: 40,
      totalStockQuantity: 65,
      stockTally: "TALLY",
    });
  });

  it("marks counter or receipt-ledger mismatches as not tally", () => {
    const line = approvedLine();
    line.advance_booked_quantity = 59;

    expect(calculateWorkOrderGrnStockSummary(line, organizationId, new Map()).stockTally)
      .toBe("NOT TALLY");

    line.advance_booked_quantity = 60;
    if (!line.generalStockReceipt) throw new Error("Test fixture must have a general-stock receipt.");
    line.generalStockReceipt.current_stock = 24;
    expect(calculateWorkOrderGrnStockSummary(line, organizationId, new Map()).stockTally)
      .toBe("NOT TALLY");
  });

  it("marks unverified GRN lines as pending", () => {
    const line = approvedLine();
    line.approved_quantity = null;

    expect(calculateWorkOrderGrnStockSummary(line, organizationId, new Map()).stockTally)
      .toBe("PENDING");
  });
});
