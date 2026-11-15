import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORGANIZATION_TRIAL_ACCESS_ENDED_MESSAGE } from "@/lib/services/platform/organization-trial-service";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import AccessBlockedPage from "./page";

describe("trial access redirect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends an expired-trial access-blocked URL to the merchandising orders page", async () => {
    redirectMock.mockImplementation((path: string) => {
      throw Object.assign(new Error("Redirect"), { digest: `NEXT_REDIRECT;replace;${path}` });
    });

    await expect(AccessBlockedPage({
      params: Promise.resolve({
        workspaceId: "workspace-id",
        organizationId: "organization-id",
      }),
      searchParams: Promise.resolve({ message: ORGANIZATION_TRIAL_ACCESS_ENDED_MESSAGE }),
    })).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/dashboard/workspace-id/organizations/organization-id/order-management/merchandising/order",
    });
  });

  it("keeps non-trial access restrictions on the access-blocked page", async () => {
    const page = await AccessBlockedPage({
      params: Promise.resolve({
        workspaceId: "workspace-id",
        organizationId: "organization-id",
      }),
      searchParams: Promise.resolve({ message: "This module is restricted." }),
    });

    expect(page).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
