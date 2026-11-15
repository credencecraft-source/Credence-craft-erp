import { describe, expect, it, vi } from "vitest";

import { getMasterRecordSearchValue } from "./master-record-search";

const record = {
  label: "NAVY BLUE",
  code: "NAV-01",
  description: "DARK BLUE",
  is_active: true,
};

describe("master record report search values", () => {
  it("uses searchable display text for built-in fields without resolving metadata", () => {
    const getFieldValue = vi.fn(() => "metadata value");

    expect(getMasterRecordSearchValue("label", record, getFieldValue)).toBe("NAVY BLUE");
    expect(getMasterRecordSearchValue("code", record, getFieldValue)).toBe("NAV-01");
    expect(getMasterRecordSearchValue("description", record, getFieldValue)).toBe("DARK BLUE");
    expect(getMasterRecordSearchValue("status", record, getFieldValue)).toBe("Active");
    expect(getMasterRecordSearchValue("actions", record, getFieldValue)).toBe("[object Object]");
    expect(getFieldValue).not.toHaveBeenCalled();
  });

  it("delegates custom master fields to the existing metadata formatter", () => {
    const getFieldValue = vi.fn((key: string) => `${key} value`);

    expect(getMasterRecordSearchValue("Fabric", record, getFieldValue)).toBe("Fabric value");
    expect(getFieldValue).toHaveBeenCalledOnce();
    expect(getFieldValue).toHaveBeenCalledWith("Fabric", record);
  });

  it("uses the same status labels displayed by the report", () => {
    expect(getMasterRecordSearchValue("status", { ...record, is_active: false }, () => "")).toBe("Pending");
  });
});
