import { describe, expect, it } from "vitest";

import { getCompatibleExistingSizeGroups } from "./master-import-size-group-options";

describe("getCompatibleExistingSizeGroups", () => {
  it("returns full details for active groups matching the Brand and every required size", () => {
    const result = getCompatibleExistingSizeGroups(
      [
        {
          id: "group-1",
          label: "S TO 6XL",
          is_active: true,
          fields: { Brand1: " ETIQUETTE ", Measurement_Chart1: "BODY CHART" },
          sizes: [
            { label: "S", is_active: true },
            { label: "M", is_active: true },
            { label: "6XL", is_active: true },
            { label: "7XL", is_active: false },
          ],
        },
        {
          id: "wrong-brand",
          label: "OTHER BRAND",
          is_active: true,
          fields: { Brand1: "OTHER" },
          sizes: [{ label: "S", is_active: true }, { label: "M", is_active: true }],
        },
        {
          id: "missing-size",
          label: "SMALL ONLY",
          is_active: true,
          fields: { Brand1: "ETIQUETTE" },
          sizes: [{ label: "S", is_active: true }],
        },
      ],
      new Set(["etiquette"]),
      ["s", "M"],
    );

    expect(result).toEqual([
      {
        id: "group-1",
        label: "S TO 6XL",
        brand: "ETIQUETTE",
        measurementChart: "BODY CHART",
        sizes: ["S", "M", "6XL"],
      },
    ]);
  });

  it("rejects malformed or inactive groups and accepts an empty required-size list", () => {
    const result = getCompatibleExistingSizeGroups(
      [
        null,
        {
          id: "inactive",
          label: "INACTIVE",
          is_active: false,
          fields: { Brand1: "ETIQUETTE" },
          sizes: [],
        },
        {
          id: "empty",
          label: "EMPTY",
          is_active: true,
          fields: { Brand1: "ETIQUETTE" },
          sizes: [],
        },
      ],
      new Set(["etiquette"]),
      [],
    );

    expect(result).toEqual([
      {
        id: "empty",
        label: "EMPTY",
        brand: "ETIQUETTE",
        measurementChart: "",
        sizes: [],
      },
    ]);
  });
});
