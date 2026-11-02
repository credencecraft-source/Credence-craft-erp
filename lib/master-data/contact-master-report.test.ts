import { describe, expect, it } from "vitest";

import { filterContactRecordsByRole } from "./contact-master-report";

const contacts = [
  { id: "contact-1", roles: [{ role_code: "DISTRIBUTOR" }, { role_code: "VENDOR" }] },
  { id: "contact-2", roles: [{ role_code: "DISTRIBUTOR" }] },
  { id: "contact-3", roles: [{ role_code: "CUSTOMER" }] },
  { id: "contact-4", roles: [] },
];

describe("filterContactRecordsByRole", () => {
  it("returns all contacts for the all-contacts view", () => {
    expect(filterContactRecordsByRole(contacts, "")).toEqual(contacts);
  });

  it("includes every contact assigned to a role, including multi-role contacts", () => {
    expect(filterContactRecordsByRole(contacts, "DISTRIBUTOR").map(({ id }) => id))
      .toEqual(["contact-1", "contact-2"]);
    expect(filterContactRecordsByRole(contacts, "VENDOR").map(({ id }) => id))
      .toEqual(["contact-1"]);
  });

  it("lists only unassigned contacts in the uncategorized view", () => {
    expect(filterContactRecordsByRole(contacts, "__UNCATEGORIZED__").map(({ id }) => id))
      .toEqual(["contact-4"]);
  });
});
