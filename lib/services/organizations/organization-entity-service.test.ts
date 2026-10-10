import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { masterEntity: { findFirst } },
}));

import { requireActiveOrganizationEntity, requireSameOrganizationEntity } from "./organization-entity-service";

describe("requireActiveOrganizationEntity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a value and scopes active lookups to the organization", async () => {
    await expect(requireActiveOrganizationEntity("org-1", " ")).rejects.toThrow("Entity is required");
    expect(findFirst).not.toHaveBeenCalled();

    findFirst.mockResolvedValue(null);
    await expect(requireActiveOrganizationEntity("org-1", "Factory")).rejects.toThrow("active Entity");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        is_active: true,
        OR: [{ id: "Factory" }, { value_id: "Factory" }, { entity_name: "Factory" }],
      },
      select: { id: true, entity_name: true },
    });
  });

  it("returns the active entity's internal ID and canonical name", async () => {
    findFirst.mockResolvedValue({ id: "entity-1", entity_name: "Factory" });

    await expect(requireActiveOrganizationEntity("org-1", "Factory")).resolves.toEqual({
      id: "entity-1",
      entity_name: "Factory",
    });
  });

  it("rejects missing and mixed entity IDs when grouping documents", () => {
    expect(requireSameOrganizationEntity(["entity-1", "entity-1"], "Same entity required.")).toBe("entity-1");
    expect(() => requireSameOrganizationEntity([], "Same entity required.")).toThrow("Same entity required.");
    expect(() => requireSameOrganizationEntity(["entity-1", null], "Same entity required.")).toThrow("Same entity required.");
    expect(() => requireSameOrganizationEntity(["entity-1", "entity-2"], "Same entity required.")).toThrow("Same entity required.");
  });
});