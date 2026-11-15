import { describe, expect, it } from "vitest";

import {
  normalizeOptionalUniformText,
  normalizeUniformText,
  parseUniformDate,
  parseUniformMeasurementValue,
  toUniformMeasurementKey,
} from "./uniform-management-contract";

describe("uniform management input contract", () => {
  it("normalizes names and optional grouping labels at the persistence boundary", () => {
    expect(normalizeUniformText("  Taylor Morgan ", "Name", 255)).toBe("TAYLOR MORGAN");
    expect(normalizeOptionalUniformText("  grade 8 - blue  ", 160)).toBe("GRADE 8 - BLUE");
    expect(normalizeOptionalUniformText("  ", 160)).toBeNull();
  });

  it("creates stable measurement keys and rejects invalid labels", () => {
    expect(toUniformMeasurementKey("Sleeve Length")).toBe("sleeve-length");
    expect(() => toUniformMeasurementKey("!!!")).toThrow("Measurement name");
  });

  it("accepts positive precise measurements and rejects invalid quantities", () => {
    expect(parseUniformMeasurementValue("42.5", "Chest")).toBe("42.5");
    expect(() => parseUniformMeasurementValue("0", "Chest")).toThrow("positive measurement");
    expect(() => parseUniformMeasurementValue("-1", "Chest")).toThrow("positive measurement");
    expect(() => parseUniformMeasurementValue("1.234", "Chest")).toThrow("positive measurement");
  });

  it("validates calendar due dates without rollover", () => {
    expect(parseUniformDate("2026-12-01")?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(parseUniformDate("")).toBeNull();
    expect(() => parseUniformDate("2026-02-30")).toThrow("valid due date");
  });
});
