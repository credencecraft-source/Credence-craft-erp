import { describe, expect, it } from "vitest";
import Page from "./page";

describe("Tech Pack module landing route", () => {
	it("redirects the module landing URL to the Gold Seal report", async () => {
		await expect(
			Page({
				params: Promise.resolve({
					workspaceId: "workspace-1",
					organizationId: "organization-1",
				}),
			}),
		).rejects.toMatchObject({
			digest: expect.stringContaining(
				"NEXT_REDIRECT;replace;/dashboard/workspace-1/organizations/organization-1/design-development/tech-pack/gold-seals",
			),
		});
	});
});
