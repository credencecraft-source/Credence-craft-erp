import { describe, expect, it } from "vitest";

import { getPageSetupTemplateApiErrorResponse } from "./page-setup-template-api-errors";

describe("Page Setup API errors", () => {
  it("reports a missing generated Prisma model as a readiness error", async () => {
    const response = getPageSetupTemplateApiErrorResponse(
      new TypeError("Cannot read properties of undefined"),
      "save",
      false,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "SCHEMA_NOT_READY",
      error: expect.stringContaining("Restart the application"),
    });
  });

  it("recognizes missing-table errors by code even when Prisma error prototypes differ", async () => {
    const response = getPageSetupTemplateApiErrorResponse(
      Object.assign(new Error("Missing table"), { code: "P2021" }),
      "save",
      true,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "SCHEMA_NOT_READY" });
  });

  it("returns a conflict only for duplicate saves", async () => {
    const error = Object.assign(new Error("Duplicate"), { code: "P2002" });
    const saveResponse = getPageSetupTemplateApiErrorResponse(error, "save", true);
    const loadResponse = getPageSetupTemplateApiErrorResponse(error, "load", true);

    expect(saveResponse.status).toBe(409);
    expect(loadResponse.status).toBe(500);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: "A page setup template with this name already exists.",
    });
  });
});
