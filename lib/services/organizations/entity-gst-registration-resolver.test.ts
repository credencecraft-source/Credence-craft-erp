import { describe, expect, it, vi } from "vitest";

import { getEntityGstRegistrationForDate } from "./entity-gst-registration-resolver";

describe("entity GST registration resolver", () => {
  it("selects only the organization/entity registration effective on the document date", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      gstin: "29ABCDE1234F1Z5",
      registration_state: "KARNATAKA",
    });
    const masterEntityFindFirst = vi.fn().mockResolvedValue(null);
    const effectiveDate = new Date("2026-10-15T00:00:00.000Z");

    await expect(getEntityGstRegistrationForDate({
      masterEntity: { findFirst: masterEntityFindFirst },
      entityGstRegistration: { findFirst },
    } as never, "org-internal", "entity-internal", effectiveDate)).resolves.toEqual({
      gstin: "29ABCDE1234F1Z5",
      registration_state: "KARNATAKA",
    });

    expect(masterEntityFindFirst).toHaveBeenCalledWith({
      where: { id: "entity-internal", organization_id: "org-internal" },
      select: { gstin: true, registered_state: true },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: "org-internal",
        entity_id: "entity-internal",
        is_active: true,
        effective_from: { lte: effectiveDate },
        OR: [{ effective_to: null }, { effective_to: { gte: effectiveDate } }],
      },
      orderBy: [{ effective_from: "desc" }, { created_at: "desc" }],
      select: { gstin: true, registration_state: true },
    });
  });

  it("uses the current GST details saved on the Entity before historical registrations", async () => {
    const findFirst = vi.fn();
    const entityGstin = {
      gstin: "29ABCDE1234F1Z5",
      registered_state: "KARNATAKA",
    };

    await expect(getEntityGstRegistrationForDate({
      masterEntity: { findFirst: vi.fn().mockResolvedValue(entityGstin) },
      entityGstRegistration: { findFirst },
    } as never, "org-internal", "entity-internal")).resolves.toEqual({
      gstin: entityGstin.gstin,
      registration_state: entityGstin.registered_state,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
