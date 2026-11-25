import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import PosOffersAliasRoute from "./page";

describe("POS offers route alias", () => {
  it("redirects the invalid offer-type path to the offers report", async () => {
    await expect(
      PosOffersAliasRoute({
        params: Promise.resolve({
          workspaceId: "workspace-1",
          organizationId: "organization-1",
        }),
      }),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/workspace-1/organizations/organization-1/pos/offers",
    );
  });
});
