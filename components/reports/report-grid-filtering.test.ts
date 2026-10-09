import { describe, expect, it } from "vitest";
import { filterIndexedReportRecords, type IndexedReportRow } from "./report-grid-filtering";

const rows: IndexedReportRow<{ id: string }>[] = [
  {
    record: { id: "1" },
    searchableText: "od-100 winter shirt",
    searchableValues: { orderNo: "od-100", season: "winter 2026" },
  },
  {
    record: { id: "2" },
    searchableText: "od-200 summer shirt",
    searchableValues: { orderNo: "od-200", season: "summer 2026" },
  },
  {
    record: { id: "3" },
    searchableText: "od-300 shirt",
    searchableValues: { orderNo: "od-300", season: "" },
  },
];

describe("filterIndexedReportRecords", () => {
  it("matches the global query against the precomputed visible-field text", () => {
    expect(filterIndexedReportRecords(rows, "WINTER", {}).map((row) => row.id)).toEqual(["1"]);
  });

  it("applies column filters together with the global query", () => {
    expect(filterIndexedReportRecords(rows, "shirt", {
      season: { operator: "contains", value: "2026" },
      orderNo: { operator: "notContains", value: "200" },
    }).map((row) => row.id)).toEqual(["1"]);
  });

  it("preserves exact and empty filter behavior", () => {
    expect(filterIndexedReportRecords(rows, "", {
      orderNo: { operator: "is", value: "OD-200" },
    }).map((row) => row.id)).toEqual(["2"]);
    expect(filterIndexedReportRecords(rows, "", {
      season: { operator: "empty", value: "" },
    }).map((row) => row.id)).toEqual(["3"]);
  });
});
