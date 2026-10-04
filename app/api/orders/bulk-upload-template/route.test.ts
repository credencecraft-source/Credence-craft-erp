import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSessionUser, requireOrganizationContext, createSelectedOrdersWorkbook } = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createSelectedOrdersWorkbook: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationContext }));
vi.mock("@/lib/services/orders/selected-orders-workbook-service", () => ({
  createSelectedOrdersWorkbook,
  SelectedOrdersWorkbookError: class SelectedOrdersWorkbookError extends Error {},
}));

import { POST } from "./route";

function makeRequest(body: unknown, workspaceId = "workspace-id") {
  return new Request(`http://localhost/api/orders/bulk-upload-template?organizationId=public-org&workspaceId=${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("selected-order workbook API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionUser.mockResolvedValue({ id: "user-id", workspace_id: "workspace-id" });
    requireOrganizationContext.mockResolvedValue({ id: "internal-organization-id" });
    createSelectedOrdersWorkbook.mockResolvedValue(Buffer.from("workbook"));
  });

  it("authorizes the route organization and downloads the selected workbook", async () => {
    const response = await POST(makeRequest({ orderIds: ["order-1", "order-2"] }));

    expect(requireOrganizationContext).toHaveBeenCalledWith("user-id", "public-org", ["OWNER", "ADMIN", "MERCHANDISING"]);
    expect(createSelectedOrdersWorkbook).toHaveBeenCalledWith("internal-organization-id", ["order-1", "order-2"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toContain("selected-orders-bulk-upload-editable-v2.xlsx");
  });

  it("rejects a workspace route mismatch before organization access", async () => {
    const response = await POST(makeRequest({ orderIds: ["order-1", "order-2"] }, "another-workspace"));

    expect(response.status).toBe(403);
    expect(requireOrganizationContext).not.toHaveBeenCalled();
    expect(createSelectedOrdersWorkbook).not.toHaveBeenCalled();
  });

  it("rejects malformed order id lists before organization access", async () => {
    const response = await POST(makeRequest({ orderIds: ["order-1", ""] }));

    expect(response.status).toBe(400);
    expect(requireOrganizationContext).not.toHaveBeenCalled();
    expect(createSelectedOrdersWorkbook).not.toHaveBeenCalled();
  });

  it("does not generate a workbook when membership authorization fails", async () => {
    requireOrganizationContext.mockRejectedValue(new Error("Access denied."));
    const response = await POST(makeRequest({ orderIds: ["order-1", "order-2"] }));

    expect(response.status).toBe(403);
    expect(createSelectedOrdersWorkbook).not.toHaveBeenCalled();
  });
});
