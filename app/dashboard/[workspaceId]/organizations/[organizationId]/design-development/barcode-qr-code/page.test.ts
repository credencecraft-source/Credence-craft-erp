import { describe, expect, it } from "vitest";
import Page from "./page";

describe("Barcode / QR Code module landing route", () => {
  it("redirects the module landing URL to the Page Setup report", async () => {
    await expect(Page({
      params: Promise.resolve({
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      }),
    })).rejects.toMatchObject({
      digest: expect.stringContaining(
        "NEXT_REDIRECT;replace;/dashboard/workspace-1/organizations/organization-1/design-development/barcode-qr-code/page-setup",
      ),
    });
  });
});
