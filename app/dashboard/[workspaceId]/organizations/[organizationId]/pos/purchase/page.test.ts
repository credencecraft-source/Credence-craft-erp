import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import PosPurchaseAliasRoute from "./page";

describe("POS purchase route alias", () => {
  it("redirects to the canonical purchase-bill report", async () => {
    await expect(
      PosPurchaseAliasRoute({
        params: Promise.resolve({
          workspaceId: "workspace-1",
          organizationId: "organization-1",
        }),
      }),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/workspace-1/organizations/organization-1/pos/purchase-bill",
    );
  });
});
