import { describe, expect, it } from "vitest";
import { getMasterRecordDetailMode } from "./master-record-detail-mode";

describe("getMasterRecordDetailMode", () => {
  it("defaults to read-only view unless edit mode is explicitly requested", () => {
    expect(getMasterRecordDetailMode(undefined)).toBe("view");
    expect(getMasterRecordDetailMode("view")).toBe("view");
    expect(getMasterRecordDetailMode("edit")).toBe("edit");
  });

  it("uses the first repeated query value", () => {
    expect(getMasterRecordDetailMode(["edit", "view"])).toBe("edit");
    expect(getMasterRecordDetailMode(["view", "edit"])).toBe("view");
  });
});
