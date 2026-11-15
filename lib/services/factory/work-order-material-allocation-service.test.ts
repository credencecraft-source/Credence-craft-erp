import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestedLines: vi.fn(),
  allWorkOrderLines: vi.fn(),
  allocations: vi.fn(),
  prisma: {
    factoryWorkOrderBomLine: { findMany: vi.fn() },
    rmGrnOrderAllocation: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));

import { Prisma } from "@prisma/client";
import { getWorkOrderBomAllocatedQuantities } from "./work-order-material-allocation-service";

describe("getWorkOrderBomAllocatedQuantities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.factoryWorkOrderBomLine.findMany.mockImplementation((args) => (
      "id" in args.where ? mocks.requestedLines() : mocks.allWorkOrderLines()
    ));
    mocks.prisma.rmGrnOrderAllocation.findMany.mockImplementation(() => mocks.allocations());
  });

  it("shares organization-level allocations across work-order demand without duplicating quantities", async () => {
    mocks.requestedLines.mockReturnValue([
      { id: "wo-line-1", source_bom_item_id: "bom-1" },
      { id: "wo-line-2", source_bom_item_id: "bom-1" },
    ]);
    mocks.allWorkOrderLines.mockReturnValue([
      { id: "wo-line-1", source_bom_item_id: "bom-1", total_required_qty: new Prisma.Decimal("10") },
      { id: "wo-line-2", source_bom_item_id: "bom-1", total_required_qty: new Prisma.Decimal("30") },
    ]);
    mocks.allocations.mockReturnValue([{
      allocated_quantity: new Prisma.Decimal("8"),
      groupedPurchaseOrderLine: { source_bom_item_id: "bom-1" },
    }]);

    const result = await getWorkOrderBomAllocatedQuantities("org-1", ["wo-line-1", "wo-line-2"]);

    expect(result.get("wo-line-1")?.toString()).toBe("2");
    expect(result.get("wo-line-2")?.toString()).toBe("6");
    expect([...result.values()].reduce((total, value) => total.plus(value), new Prisma.Decimal(0)).toString()).toBe("8");
    expect(mocks.prisma.factoryWorkOrderBomLine.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { source_bom_item_id: { in: ["bom-1"] }, workOrder: { organization_id: "org-1" } },
    }));
  });

  it("distributes rounding remainders without exceeding any work-order requirement", async () => {
    mocks.requestedLines.mockReturnValue([
      { id: "wo-line-1", source_bom_item_id: "bom-1" },
      { id: "wo-line-2", source_bom_item_id: "bom-1" },
      { id: "wo-line-3", source_bom_item_id: "bom-1" },
    ]);
    mocks.allWorkOrderLines.mockReturnValue([
      { id: "wo-line-1", source_bom_item_id: "bom-1", total_required_qty: new Prisma.Decimal("1") },
      { id: "wo-line-2", source_bom_item_id: "bom-1", total_required_qty: new Prisma.Decimal("1") },
      { id: "wo-line-3", source_bom_item_id: "bom-1", total_required_qty: new Prisma.Decimal("1") },
    ]);
    mocks.allocations.mockReturnValue([{
      allocated_quantity: new Prisma.Decimal("2.99"),
      groupedPurchaseOrderLine: { source_bom_item_id: "bom-1" },
    }]);

    const result = await getWorkOrderBomAllocatedQuantities("org-1", ["wo-line-1", "wo-line-2", "wo-line-3"]);

    expect([...result.values()].map((value) => value.toString())).toEqual(["1", "1", "0.99"]);
    expect([...result.values()].reduce((total, value) => total.plus(value), new Prisma.Decimal(0)).toString()).toBe("2.99");
  });
});
