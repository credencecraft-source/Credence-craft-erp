import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSessionUser, requireOrganizationContext, createArticleBasedOrders } = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createArticleBasedOrders: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationContext }));
vi.mock("@/lib/services/orders/article-based-order-service", () => ({ createArticleBasedOrders }));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: vi.fn(() => false),
}));

import { POST } from "./route";

function makeRequest(body: unknown, organizationId = "public-organization-id") {
  return new Request(
    `http://localhost/api/orders/from-article?organizationId=${encodeURIComponent(organizationId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionUser.mockResolvedValue({ id: "user-id" });
  requireOrganizationContext.mockResolvedValue({ id: "internal-organization-id" });
  createArticleBasedOrders.mockResolvedValue([{ id: "order-id", orderNo: "OD-17", orderQty: 15 }]);
});

describe("POST /api/orders/from-article", () => {
  it("authorizes the route organization before creating orders with its internal id", async () => {
    const requestBody = { articleId: "article-id", colors: [] };
    const response = await POST(makeRequest(requestBody));

    expect(response.status).toBe(200);
    expect(requireOrganizationContext).toHaveBeenCalledWith(
      "user-id",
      "public-organization-id",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(createArticleBasedOrders).toHaveBeenCalledWith("internal-organization-id", requestBody, "user-id");
    expect(await response.json()).toEqual({
      ok: true,
      orders: [{ id: "order-id", orderNo: "OD-17", orderQty: 15 }],
    });
  });

  it("rejects requests without an organization before calling the order service", async () => {
    const response = await POST(makeRequest({}, ""));

    expect(response.status).toBe(400);
    expect(createArticleBasedOrders).not.toHaveBeenCalled();
  });

  it("preserves the authentication redirect for unauthenticated requests", async () => {
    const redirectError = Object.assign(new Error("Redirect to sign in."), {
      digest: "NEXT_REDIRECT;replace;/;307;",
    });
    requireSessionUser.mockRejectedValue(redirectError);

    await expect(POST(makeRequest({ articleId: "article-id" }))).rejects.toBe(redirectError);
    expect(requireOrganizationContext).not.toHaveBeenCalled();
    expect(createArticleBasedOrders).not.toHaveBeenCalled();
  });

  it("does not create orders when organization membership authorization fails", async () => {
    requireOrganizationContext.mockRejectedValue(new Error("Organization access denied."));

    const response = await POST(makeRequest({ articleId: "article-id" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Organization access denied." });
    expect(createArticleBasedOrders).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON payload shapes before calling the order service", async () => {
    const response = await POST(makeRequest([]));

    expect(response.status).toBe(400);
    expect(createArticleBasedOrders).not.toHaveBeenCalled();
  });
});
