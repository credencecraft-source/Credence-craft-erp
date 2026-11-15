import { describe, expect, it } from "vitest";
import XlsxPopulate from "xlsx-populate";
import * as XLSX from "xlsx";

import { PLATFORM_LEAD_STAGES } from "./platform-lead-constants";
import { createPlatformLeadsWorkbook } from "./platform-lead-workbook-service";

describe("createPlatformLeadsWorkbook", () => {
  it("exports lead data and adds the configured stage dropdown", async () => {
    const buffer = await createPlatformLeadsWorkbook([{
      name: "Taylor Reed",
      email: "taylor@example.com",
      mobile: "+919876543210",
      company_name: "Acme Apparel",
      nature_of_business: "Garment manufacturing",
      city: "Bengaluru",
      source: "Referral",
      stage: "2-Potential",
      created_at: new Date("2026-10-02T10:30:00.000Z"),
    }]);
    const workbook = await XlsxPopulate.fromDataAsync(buffer);
    const leadsSheet = workbook.sheet("Leads");
    const parsed = XLSX.read(buffer, { type: "buffer" });

    expect(parsed.SheetNames).toEqual(["Leads", "Stages"]);
    expect(leadsSheet.range("A1:I2").value()).toEqual([
      ["Name", "Email", "Mobile", "Company name", "Nature of business", "City", "Source", "Stage", "Added date & time"],
      ["Taylor Reed", "taylor@example.com", 919876543210, "Acme Apparel", "Garment manufacturing", "Bengaluru", "Referral", "2-Potential", new Date("2026-10-02T10:30:00.000Z").toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
    ]);
    expect(XLSX.utils.sheet_to_json<unknown[]>(parsed.Sheets.Leads, {
      header: 1,
      defval: "",
      raw: false,
    })[1][2]).toBe("919876543210");
    expect(leadsSheet.range("H2:H501").dataValidation()).toMatchObject({
      type: "list",
      allowBlank: "false",
      showErrorMessage: "true",
      formula1: "PlatformLeadStages",
    });
    expect(workbook.sheet("Stages").range(`A2:A${PLATFORM_LEAD_STAGES.length + 1}`).value())
      .toEqual(PLATFORM_LEAD_STAGES.map((stage) => [stage]));
    expect(workbook.sheet("Stages").hidden()).toBe(true);
  });
});
