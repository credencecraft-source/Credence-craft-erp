import { describe, expect, it } from "vitest";

import {
  countLeadsByAssignmentQueue,
  filterLeadStageTabs,
  filterLeadsByAssignmentQueue,
} from "./platform-lead-queue";

const leads = [
  { id: "assigned-a", assigned_sales_manager_id: "manager-a", stage: "1-new" },
  { id: "unassigned", assigned_sales_manager_id: null, stage: "1-new" },
  { id: "assigned-b", assigned_sales_manager_id: "manager-b", stage: "Verification" },
];

describe("filterLeadsByAssignmentQueue", () => {
  it("returns assigned leads for the All/status tabs", () => {
    expect(filterLeadsByAssignmentQueue(leads, "ASSIGNED").map(({ id }) => id))
      .toEqual(["assigned-a", "assigned-b"]);
  });

  it("returns only unassigned leads for the claim queue", () => {
    expect(filterLeadsByAssignmentQueue(leads, "UNASSIGNED").map(({ id }) => id))
      .toEqual(["unassigned"]);
  });

  it("keeps each queue badge count independent of the currently selected queue", () => {
    const allStages = ["1-new", "Verification"];
    expect(countLeadsByAssignmentQueue(leads, "ASSIGNED", allStages)).toBe(2);
    expect(countLeadsByAssignmentQueue(leads, "UNASSIGNED", allStages)).toBe(1);
  });
});

describe("filterLeadStageTabs", () => {
  const tabs = [
    { value: "ALL" },
    { value: "1-new" },
    { value: "Verification" },
  ];

  it("keeps only All leads in the unassigned queue", () => {
    expect(filterLeadStageTabs(tabs, true)).toEqual([{ value: "ALL" }]);
  });

  it("keeps every status tab in the assigned queue", () => {
    expect(filterLeadStageTabs(tabs, false)).toEqual(tabs);
  });
});
