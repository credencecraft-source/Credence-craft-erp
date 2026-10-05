import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createWorkOrderMaterialRequest: vi.fn(),
  acceptRawMaterialOutwardRequest: vi.fn(),
  markRawMaterialOutwardItemPicked: vi.fn(),
  createRawMaterialOutwardBox: vi.fn(),
  createRawMaterialOutwardShipment: vi.fn(),
  listRawMaterialOutwardWorkflow: vi.fn(),
  getRawMaterialPickHistoryForGroupedLine: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/inventory/raw-material-outward-service", () => ({
  createWorkOrderMaterialRequest: mocks.createWorkOrderMaterialRequest,
  acceptRawMaterialOutwardRequest: mocks.acceptRawMaterialOutwardRequest,
  markRawMaterialOutwardItemPicked: mocks.markRawMaterialOutwardItemPicked,
  createRawMaterialOutwardBox: mocks.createRawMaterialOutwardBox,
  createRawMaterialOutwardShipment: mocks.createRawMaterialOutwardShipment,
  listRawMaterialOutwardWorkflow: mocks.listRawMaterialOutwardWorkflow,
  getRawMaterialPickHistoryForGroupedLine: mocks.getRawMaterialPickHistoryForGroupedLine,
}));

import { GET, POST } from "./route";

const user = { id: "user-1", full_name: "Factory User" };
const jsonRequest = (body: unknown) => new Request("http://localhost/api/inventory/raw-material-outward", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("raw-material-outward route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue(user);
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.createWorkOrderMaterialRequest.mockResolvedValue({ id: "request-1", request_no: "RMR-1" });
    mocks.listRawMaterialOutwardWorkflow.mockResolvedValue({ requests: [], boxes: [], shipments: [] });
  });

  it("requires authentication before loading organization requests", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("No session"));

    const response = await GET(new Request("http://localhost/api/inventory/raw-material-outward?organizationId=public-org"));

    expect(response.status).toBe(401);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
  });

  it("creates a request from the internal organization context with the factory role", async () => {
    const response = await POST(jsonRequest({
      organizationId: "public-org",
      action: "request",
      workOrderId: "wo-1",
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.createWorkOrderMaterialRequest).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      actorName: "Factory User",
      workOrderId: "wo-1",
      requestedBy: "Factory User",
    });
  });

  it("rejects an unauthorized factory request without calling the service", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: insufficient organization permissions."));

    const response = await POST(jsonRequest({
      organizationId: "public-org",
      action: "request",
      workOrderId: "wo-1",
    }));

    expect(response.status).toBe(403);
    expect(mocks.createWorkOrderMaterialRequest).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON shapes and unknown actions", async () => {
    const invalidBody = await POST(jsonRequest([]));
    const invalidAction = await POST(jsonRequest({ organizationId: "public-org", action: "delete" }));

    expect(invalidBody.status).toBe(400);
    expect(invalidAction.status).toBe(400);
  });

  it("returns pick history for an organization-authorized allocation line", async () => {
    mocks.getRawMaterialPickHistoryForGroupedLine.mockResolvedValue({
      rawMaterialName: "Cotton",
      requestedTotal: "10",
      pickedTotal: "8",
      records: [],
    });
    const response = await GET(new Request(
      "http://localhost/api/inventory/raw-material-outward?organizationId=public-org&groupedPurchaseOrderLineId=group-line-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.getRawMaterialPickHistoryForGroupedLine).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "group-line-1",
    );
    expect(mocks.listRawMaterialOutwardWorkflow).not.toHaveBeenCalled();
  });

  it("returns not found for allocation lines outside the organization", async () => {
    mocks.getRawMaterialPickHistoryForGroupedLine.mockResolvedValue(null);
    const response = await GET(new Request(
      "http://localhost/api/inventory/raw-material-outward?organizationId=public-org&groupedPurchaseOrderLineId=foreign-line",
    ));

    expect(response.status).toBe(404);
  });

  it("passes only selected picked-item IDs when creating a box", async () => {
    mocks.createRawMaterialOutwardBox.mockResolvedValue({ id: "box-1", box_no: "RM-BOX-1" });

    const response = await POST(jsonRequest({
      organizationId: "public-org",
      action: "box",
      requestLineIds: ["line-1", "line-2"],
    }));

    expect(response.status).toBe(201);
    expect(mocks.createRawMaterialOutwardBox).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      actorName: "Factory User",
      requestLineIds: ["line-1", "line-2"],
    });
  });

  it("rejects box quantity payloads instead of accepting client-supplied quantities", async () => {
    const response = await POST(jsonRequest({
      organizationId: "public-org",
      action: "box",
      lines: [{ requestLineId: "line-1", quantity: "1" }],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createRawMaterialOutwardBox).not.toHaveBeenCalled();
  });
});
