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
      findMany: vi.fn(),
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
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    contactRoleDefinition: { findMany: vi.fn() },
    contactRoleAssignment: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    contactTaxRegistration: { findMany: vi.fn(), deleteMany: vi.fn() },
    contactAddress: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    contactBankAccount: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(() => ({ id: "bank-1" })), deleteMany: vi.fn() },
    auditEvent: { createMany: vi.fn() },
    masterVendor: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    masterBuyer: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    merchandisingOrder: { findMany: vi.fn() },
  };
  const createAuditEvent = vi.fn();
  return {
    tx,
    createAuditEvent,
    transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/auth/secret-cryptography", () => ({ encryptSecret: vi.fn() }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import { createContact, deactivateContacts, deleteUnusedContacts } from "./contact-master-service";

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

  it("creates a contact without role assignments when no role is provided", async () => {
    mocks.tx.contact.findFirst.mockImplementation(() => ({
      id: "contact-CT1",
      code: "CT1",
      legal_name: "ACME APPAREL",
      display_name: null,
      email: null,
      phone: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      roles: [],
      tax_registrations: [],
      addresses: [],
      bank_accounts: [],
    }));

    const contact = await createContact("org-1", "user-1", {
      legalName: "Acme Apparel",
      roles: [],
      taxRegistrations: [],
      addresses: [],
      bankAccounts: [],
    });

    expect(contact.code).toBe("CT1");
    expect(mocks.tx.contactRoleDefinition.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.contactRoleAssignment.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.contactRoleAssignment.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.contactTaxRegistration.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.contactAddress.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.contactBankAccount.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.contactBankAccount.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.masterVendor.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.masterBuyer.findFirst).not.toHaveBeenCalled();
  });

  it("rejects multiple GSTINs before creating a contact", async () => {
    await expect(createContact("org-1", "user-1", {
      legalName: "Acme Apparel",
      roles: ["VENDOR"],
      taxRegistrations: [
        { gstin: "27AAPFU0939F1ZV", legalName: "Acme Apparel", registrationType: "REGULAR", status: "ACTIVE" },
        { gstin: "22AAAAA0000A1ZC", legalName: "Acme Apparel", registrationType: "REGULAR", status: "ACTIVE" },
      ],
      addresses: [],
      bankAccounts: [],
    })).rejects.toThrow("A contact can have only one GSTIN. Create a separate contact for each additional GSTIN.");

    expect(mocks.tx.contact.create).not.toHaveBeenCalled();
  });

  it("creates a contact with a blank name and incomplete bank details", async () => {
    await createContact("org-1", "user-1", {
      legalName: "",
      roles: [],
      taxRegistrations: [],
      addresses: [],
      bankAccounts: [{
        accountHolderName: "",
        ifscCode: "",
        bankName: "",
        isDefault: false,
      }],
    });

    expect(mocks.tx.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ legal_name: "" }),
    }));
    expect(mocks.tx.contactBankAccount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        account_number_encrypted: undefined,
        account_number_last4: "",
        account_holder_name: "",
        ifsc_code: "",
        bank_name: "",
      }),
    }));
  });

  it("deactivates selected contacts transactionally and scopes every write to the organization", async () => {
    mocks.tx.contact.findMany.mockResolvedValue([
      { id: "contact-1", code: "CT1", is_active: true },
      { id: "contact-2", code: "CT2", is_active: false },
    ]);
    mocks.tx.contact.findFirst.mockImplementation(() => ({
      id: "contact-1",
      code: "CT1",
      legal_name: "ACME APPAREL",
      display_name: null,
      email: null,
      phone: null,
      is_active: false,
      created_at: new Date(),
      updated_at: new Date(),
      roles: [],
      tax_registrations: [],
      addresses: [],
      bank_accounts: [],
    }));

    const result = await deactivateContacts("org-1", "user-1", ["contact-1", "contact-2"]);

    expect(result).toEqual({ deactivatedCount: 1 });
    expect(mocks.tx.contact.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: { in: ["contact-1", "contact-2"] } },
      select: { id: true, code: true, is_active: true },
    });
    expect(mocks.tx.contact.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: "contact-1" },
      data: { is_active: false },
    });
    expect(mocks.tx.contactRoleAssignment.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", contact_id: "contact-1" },
      data: { is_active: false },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("does not mutate contacts when any selected ID is outside the organization", async () => {
    mocks.tx.contact.findMany.mockResolvedValue([{ id: "contact-1", code: "CT1", is_active: true }]);

    const result = await deactivateContacts("org-1", "user-1", ["contact-1", "foreign-contact"]);

    expect(result).toBeNull();
    expect(mocks.tx.contact.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.contactRoleAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects duplicate or oversized selections before opening a transaction", async () => {
    await expect(deactivateContacts("org-1", "user-1", ["contact-1", "contact-1"]))
      .rejects.toThrow("Select between 1 and 200 unique valid contacts.");
    await expect(deactivateContacts("org-1", "user-1", Array.from({ length: 201 }, (_, index) => `contact-${index}`)))
      .rejects.toThrow("Select between 1 and 200 unique valid contacts.");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("deletes more than 100 selected unused contacts in the same bounded bulk request", async () => {
    const contacts = Array.from({ length: 101 }, (_, index) => ({
      id: `contact-${index + 1}`,
      code: `CT${index + 1}`,
    }));
    const contactIds = contacts.map((contact) => contact.id);
    mocks.tx.contact.findMany.mockResolvedValue(contacts);
    mocks.tx.purchaseOrder.findMany.mockResolvedValue([]);
    mocks.tx.merchandisingOrder.findMany.mockResolvedValue([]);
    mocks.tx.masterVendor.findMany.mockResolvedValue([]);
    mocks.tx.contact.deleteMany.mockResolvedValue({ count: contacts.length });

    const result = await deleteUnusedContacts("org-1", "user-1", contactIds);

    expect(result).toEqual({ deletedCount: contacts.length, retainedContactCodes: [] });
    expect(mocks.tx.auditEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ entity_id: "contact-1", action: "CONTACT_DELETED" }),
        expect.objectContaining({ entity_id: "contact-101", action: "CONTACT_DELETED" }),
      ]),
    });
    expect(mocks.tx.auditEvent.createMany.mock.calls[0][0].data).toHaveLength(contacts.length);
    expect(mocks.tx.contact.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: { in: contactIds } },
      select: { id: true, code: true },
    });
    expect(mocks.tx.contact.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: { in: contactIds } },
    });
  });

  it("deletes unused contacts and their unreferenced projections while retaining contacts used by orders", async () => {
    mocks.tx.contact.findMany.mockResolvedValue([
      { id: "contact-1", code: "CT1" },
      { id: "contact-2", code: "CT2" },
      { id: "contact-3", code: "CT3" },
    ]);
    mocks.tx.purchaseOrder.findMany.mockResolvedValue([{ contact_id: "contact-2" }]);
    mocks.tx.merchandisingOrder.findMany.mockResolvedValue([]);
    mocks.tx.masterVendor.findMany.mockResolvedValue([
      {
        id: "vendor-1",
        contact_id: "contact-1",
        _count: {
          groupedPurchaseOrders: 0,
          masterPurchaseOrders: 0,
          purchaseOrders: 0,
          rawMaterialStockBookings: 0,
          generalPurchaseOrderRequests: 0,
          distributionQuotations: 0,
        },
      },
      {
        id: "vendor-3",
        contact_id: "contact-3",
        _count: {
          groupedPurchaseOrders: 0,
          masterPurchaseOrders: 0,
          purchaseOrders: 0,
          rawMaterialStockBookings: 1,
          generalPurchaseOrderRequests: 0,
          distributionQuotations: 0,
        },
      },
    ]);
    mocks.tx.contact.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteUnusedContacts("org-1", "user-1", ["contact-1", "contact-2", "contact-3"]);

    expect(result).toEqual({ deletedCount: 1, retainedContactCodes: ["CT2", "CT3"] });
    expect(mocks.tx.contactAddress.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", contact_id: { in: ["contact-1"] } },
    });
    expect(mocks.tx.masterVendor.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: { in: ["vendor-1"] } },
    });
    expect(mocks.tx.contact.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: { in: ["contact-1"] } },
    });
    expect(mocks.tx.auditEvent.createMany).toHaveBeenCalledWith({
      data: [{
        organization_id: "org-1",
        user_id: "user-1",
        module: "MASTER_DATA",
        action: "CONTACT_DELETED",
        entity_type: "Contact",
        entity_id: "contact-1",
        details: { code: "CT1", reason: "UNUSED_CONTACT_BULK_DELETE" },
      }],
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("retains contacts referenced by sales orders and makes no changes when all are in use", async () => {
    mocks.tx.contact.findMany.mockResolvedValue([{ id: "contact-1", code: "CT1" }]);
    mocks.tx.purchaseOrder.findMany.mockResolvedValue([]);
    mocks.tx.merchandisingOrder.findMany.mockResolvedValue([{ contact_id: "contact-1" }]);
    mocks.tx.masterVendor.findMany.mockResolvedValue([]);

    const result = await deleteUnusedContacts("org-1", "user-1", ["contact-1"]);

    expect(result).toEqual({ deletedCount: 0, retainedContactCodes: ["CT1"] });
    expect(mocks.tx.contact.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.masterBuyer.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("does not delete anything when a selected ID is outside the organization", async () => {
    mocks.tx.contact.findMany.mockResolvedValue([{ id: "contact-1", code: "CT1" }]);

    const result = await deleteUnusedContacts("org-1", "user-1", ["contact-1", "foreign-contact"]);

    expect(result).toBeNull();
    expect(mocks.tx.purchaseOrder.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.contact.deleteMany).not.toHaveBeenCalled();
  });
});
