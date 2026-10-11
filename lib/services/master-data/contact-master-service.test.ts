import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let code = "";
  const tx = {
    contactCodeCounter: { upsert: vi.fn() },
    contact: {
      create: vi.fn((args: { data: { code: string } }) => {
        code = args.data.code;
        return { id: `contact-${code}` };
      }),
      findFirst: vi.fn(() => ({
        id: `contact-${code}`,
        code,
        legal_name: "ACME APPAREL",
        display_name: null,
        email: null,
        phone: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        roles: [{ role_code: "CUSTOMER" }],
        tax_registrations: [],
        addresses: [],
        bank_accounts: [],
      })),
    },
    contactRoleDefinition: { findMany: vi.fn() },
    contactRoleAssignment: { findMany: vi.fn(), createMany: vi.fn() },
    contactTaxRegistration: { findMany: vi.fn() },
    contactAddress: { findMany: vi.fn(), updateMany: vi.fn() },
    contactBankAccount: { findMany: vi.fn(), updateMany: vi.fn() },
    masterVendor: { findFirst: vi.fn() },
    masterBuyer: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/auth/secret-cryptography", () => ({ encryptSecret: vi.fn() }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: vi.fn(),
}));

import { createContact } from "./contact-master-service";

describe("contact master numbering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.contactCodeCounter.upsert
      .mockResolvedValueOnce({ current_value: 1 })
      .mockResolvedValueOnce({ current_value: 2 });
    mocks.tx.contactRoleDefinition.findMany.mockResolvedValue([{ code: "CUSTOMER" }]);
    mocks.tx.contactRoleAssignment.findMany.mockResolvedValue([]);
    mocks.tx.contactTaxRegistration.findMany.mockResolvedValue([]);
    mocks.tx.contactAddress.findMany.mockResolvedValue([]);
    mocks.tx.contactBankAccount.findMany.mockResolvedValue([]);
    mocks.tx.masterVendor.findFirst.mockResolvedValue(null);
    mocks.tx.masterBuyer.findFirst.mockResolvedValue(null);
    mocks.tx.masterBuyer.count.mockResolvedValue(0);
    mocks.tx.contact.create.mockImplementation((args) => {
      const created = args.data.code;
      mocks.tx.contact.findFirst.mockImplementation(() => ({
        id: `contact-${created}`,
        code: created,
        legal_name: "ACME APPAREL",
        display_name: null,
        email: null,
        phone: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        roles: [{ role_code: "CUSTOMER" }],
        tax_registrations: [],
        addresses: [],
        bank_accounts: [],
      }));
      return { id: `contact-${created}` };
    });
  });

  it("assigns sequential organization-scoped codes atomically", async () => {
    const input = {
      code: "USER-CODE",
      legalName: "Acme Apparel",
      roles: ["CUSTOMER"],
      taxRegistrations: [],
      addresses: [],
      bankAccounts: [],
    };

    const first = await createContact("org-1", "user-1", input);
    const second = await createContact("org-1", "user-1", input);

    expect(first.code).toBe("CT1");
    expect(second.code).toBe("CT2");
    expect(mocks.tx.contactCodeCounter.upsert).toHaveBeenNthCalledWith(1, {
      where: { organization_id: "org-1" },
      create: { organization_id: "org-1", current_value: 1 },
      update: { current_value: { increment: 1 } },
      select: { current_value: true },
    });
    expect(mocks.tx.contact.create.mock.calls.map(([args]) => args.data.code)).toEqual(["CT1", "CT2"]);
  });
});
