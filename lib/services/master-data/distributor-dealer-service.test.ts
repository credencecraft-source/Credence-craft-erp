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
      contactDistributorDealerAssignment: { findMany: vi.fn() },
    },
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  listDistributorDealers,
  replaceDistributorDealers,
  replaceRoleMappedContacts,
} from "./distributor-dealer-service";

describe("distributor and dealer role separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.contact.findFirst.mockResolvedValue({ id: "contact-1" });
    mocks.transaction.contactRoleAssignment.findMany.mockResolvedValue([]);
    mocks.transaction.contact.findMany.mockResolvedValue([{ id: "contact-2" }]);
  });

  it("displays duplicate preserved mappings only once per Dealer", async () => {
    mocks.prisma.contactDistributorDealerAssignment.findMany.mockResolvedValue([
      {
        id: "mapping-1",
        dealer: {
          id: "dealer-1",
          code: "D-1",
          legal_name: "DEALER",
          display_name: "DEALER",
          is_active: true,
        },
      },
      {
        id: "mapping-2",
        dealer: {
          id: "dealer-1",
          code: "D-1",
          legal_name: "DEALER",
          display_name: "DEALER",
          is_active: true,
        },
      },
    ]);

    await expect(listDistributorDealers("org-1", "distributor-1")).resolves.toEqual([{
      id: "dealer-1",
      mappingId: "mapping-1",
      code: "D-1",
      legalName: "DEALER",
      displayName: "DEALER",
      isActive: true,
    }]);
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
