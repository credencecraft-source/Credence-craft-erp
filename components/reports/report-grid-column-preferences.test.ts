import { describe, expect, it } from "vitest";

import { migrateReportGridVisibleFields } from "./report-grid-column-preferences";

describe("migrateReportGridVisibleFields", () => {
  it("preserves saved columns and adds newly requested columns once", () => {
    expect(migrateReportGridVisibleFields(
      ["name", "mobile", "removed-field"],
      ["name", "email", "mobile"],
      ["email"],
    )).toEqual(["name", "mobile", "email"]);
  });

  it("does not duplicate a column that is already visible", () => {
    expect(migrateReportGridVisibleFields(
      ["name", "email"],
      ["name", "email"],
      ["email"],
    )).toEqual(["name", "email"]);
  });
});
