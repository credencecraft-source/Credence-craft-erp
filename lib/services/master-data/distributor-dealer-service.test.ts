import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    contact: { findFirst: vi.fn(), findMany: vi.fn() },
    contactRoleAssignment: { findMany: vi.fn(), upsert: vi.fn(), createMany: vi.fn() },
    contactDistributorDealerAssignment: { findFirst: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    contactRoleMapping: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    },
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import { replaceDistributorDealers, replaceRoleMappedContacts } from "./distributor-dealer-service";

describe("distributor and dealer role separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.contact.findFirst.mockResolvedValue({ id: "contact-1" });
    mocks.transaction.contactRoleAssignment.findMany.mockResolvedValue([]);
    mocks.transaction.contact.findMany.mockResolvedValue([{ id: "contact-2" }]);
  });

  it("does not promote an Agent contact to Distributor", async () => {
    mocks.transaction.contactRoleAssignment.findMany.mockResolvedValue([{ role_code: "AGENT" }]);

    await expect(replaceDistributorDealers("org-1", "user-1", "contact-1", []))
      .rejects.toThrow(/must belong to separate contacts/);

    expect(mocks.transaction.contactRoleAssignment.upsert).not.toHaveBeenCalled();
  });

  it("does not assign an Agent contact as a Dealer", async () => {
    mocks.transaction.contactRoleAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        role_code: "AGENT",
        contact: { display_name: "Agent Contact", legal_name: "Agent Contact", code: "CT-2" },
      }]);

    await expect(replaceDistributorDealers("org-1", "user-1", "contact-1", ["contact-2"]))
      .rejects.toThrow(/Agent role and cannot be a Dealer/);

    expect(mocks.transaction.contactRoleAssignment.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["AGENT", "DISTRIBUTOR"],
    ["DEALER", "AGENT"],
    ["AGENT", "DEALER"],
    ["DEALER", "DISTRIBUTOR"],
  ] as const)("does not assign %s to a contact already assigned %s", async (requestedRole, currentRole) => {
    mocks.transaction.contactRoleAssignment.findMany.mockResolvedValue([{ role_code: currentRole }]);

    await expect(replaceRoleMappedContacts(
      "org-1",
      "user-1",
      requestedRole,
      "contact-1",
      [],
    )).rejects.toThrow(/must belong to separate contacts/);

    expect(mocks.transaction.contactRoleAssignment.upsert).not.toHaveBeenCalled();
  });
});
