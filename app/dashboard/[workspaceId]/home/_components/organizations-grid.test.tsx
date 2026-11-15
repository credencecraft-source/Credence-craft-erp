import { describe, expect, it } from "vitest";

import { formatIndianMobileNumber, getApprovalContactDetails } from "./organizations-grid";

describe("organization approval phone details", () => {
  it("formats workspace mobile numbers for Indian contact workflows", () => {
    expect(formatIndianMobileNumber("919567048809")).toBe("91-9567048809");
    expect(formatIndianMobileNumber("9567048809")).toBe("91-9567048809");
    expect(formatIndianMobileNumber("")).toBe("");
  });

  it("includes the support contact for pending approval prompts", () => {
    const details = getApprovalContactDetails("919567048809");

    expect(details.workspaceNumber).toBe("91-9567048809");
    expect(details.supportNumber).toBe("91-9567048809");
  });
});
