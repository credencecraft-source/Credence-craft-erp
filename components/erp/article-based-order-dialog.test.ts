import { describe, expect, it } from "vitest";

import { createMasterOptionLookup, parseOrderLookups, resolveMasterOption } from "./article-based-order-dialog";

describe("article based order dialog lookup indexes", () => {
  it("maps option IDs, value IDs, labels, and codes to a single lookup table", () => {
    const options = [
      { id: "opt-1", value_id: "value-1", label: "NAVY", code: "NAV", fields: {} },
      { id: "opt-2", value_id: "value-2", label: "BLACK", code: null, fields: {} },
    ];

    const lookup = createMasterOptionLookup(options);

    expect(lookup.get("opt-1")).toMatchObject({ id: "opt-1", value_id: "value-1" });
    expect(lookup.get("navy")).toMatchObject({ id: "opt-1" });
    expect(lookup.get("nav")).toMatchObject({ id: "opt-1" });
  });

  it("resolves lookup matches by id or display identity without scanning the full list", () => {
    const options = [
      { id: "group-1", value_id: "group-value-1", label: "SIZE GROUP 01", code: null, fields: {} },
    ];

    expect(resolveMasterOption(options, "group-1")).toMatchObject({ id: "group-1" });
    expect(resolveMasterOption(options, "SIZE GROUP 01")).toMatchObject({ id: "group-1" });
    expect(resolveMasterOption(options, "missing")).toBeNull();
  });

  it("preserves the first matching option when labels or codes collide", () => {
    const options = [
      { id: "article-1", value_id: "article-value-1", label: "CLASSIC", code: "ART-01", fields: {} },
      { id: "article-2", value_id: "article-value-2", label: "CLASSIC", code: "ART-01", fields: {} },
    ];

    const lookup = createMasterOptionLookup(options);

    expect(lookup.get("classic")).toMatchObject({ id: "article-1" });
    expect(lookup.get("art-01")).toMatchObject({ id: "article-1" });
  });

  it("parses compact order lookup payloads while retaining article variant and size metadata", () => {
    const parsed = parseOrderLookups({
      masterOptions: {
        article: [{
          id: "article-1",
          value_id: "article-value-1",
          label: "Jacket",
          fields: {
            Size_Group: "size-group-1",
            Sizes: ["M", "L"],
            variants: [{ id: "variant-1", color: "NAVY" }],
          },
        }],
        "size-group": [{
          id: "size-group-1",
          value_id: "size-group-value-1",
          label: "SIZE GROUP 01",
          fields: { Brand1: "brand-1" },
        }],
      },
    });

    expect(parsed.articles).toHaveLength(1);
    expect(parsed.articles[0].sizes).toEqual(["M", "L"]);
    expect(parsed.articles[0].variants).toEqual([{ id: "variant-1", color: "NAVY" }]);
    expect(parsed.sizeGroups[0].fields.Brand1).toBe("brand-1");
  });
});
