import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createOrdersAtomically: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/orders/order-service", () => ({
  createOrdersAtomically: mocks.createOrdersAtomically,
}));

import { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";
import { POST } from "./batch-orders-handler";

describe("batch merchandising order API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.createOrdersAtomically.mockResolvedValue([
      { id: "order-1", orderNo: "OD-1", finalStatus: "Draft" },
      { id: "order-2", orderNo: "OD-2", finalStatus: "Draft" },
    ]);
  });

  it("creates the submitted batch atomically within the authorized organization", async () => {
    const response = await POST(new Request(
      "http://localhost/api/orders/batch?organizationId=public-org-id",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: [{ entityName: "Factory" }, { entityName: "Factory" }] }),
      },
    ));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      orders: [
        { id: "order-1", orderNo: "OD-1", finalStatus: "Draft" },
        { id: "order-2", orderNo: "OD-2", finalStatus: "Draft" },
      ],
    });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org-id",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.createOrdersAtomically).toHaveBeenCalledWith(
      "internal-org-1",
      [{ entityName: "Factory" }, { entityName: "Factory" }],
      "user-1",
    );
  });

  it("rejects empty, oversized, and malformed batches", async () => {
    for (const orders of [[], Array.from({ length: 501 }, () => ({})), [{} , null]]) {
      const response = await POST(new Request("http://localhost/api/orders/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "public-org-id", orders }),
      }));
      expect(response.status).toBe(400);
    }
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.createOrdersAtomically).not.toHaveBeenCalled();
  });

  it("returns an explicit database-unavailable response without committing a partial batch", async () => {
    mocks.createOrdersAtomically.mockRejectedValue({ code: "P1001" });
    const response = await POST(new Request(
      "http://localhost/api/orders/batch?organizationId=public-org-id",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: [{ entityName: "Factory" }] }),
      },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: DATABASE_UNAVAILABLE_MESSAGE });
  });

  it("does not bypass organization membership or role authorization", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied."));
    const response = await POST(new Request(
      "http://localhost/api/orders/batch?organizationId=other-org",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: [{ entityName: "Factory" }] }),
      },
    ));

    expect(response.status).toBe(400);
    expect(mocks.createOrdersAtomically).not.toHaveBeenCalled();
  });
});
