import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const database = {
    masterModule: { upsert: vi.fn() },
    masterModuleValue: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    contact: { findMany: vi.fn(), findFirst: vi.fn() },
    priceListContactAssignment: { findMany: vi.fn(), create: vi.fn() },
    approvalRequest: { create: vi.fn() },
  };
  const transaction = vi.fn(async (callback: (tx: typeof database) => Promise<unknown>) => callback(database));
  const createAuditEvent = vi.fn();
  return { database, transaction, createAuditEvent };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { ...mocks.database, $transaction: mocks.transaction },
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  assignContactToPriceList,
  getPriceListRecord,
  listAvailablePriceListContacts,
  listPriceListContactAssignments,
  createPriceListForContact,
} from "./price-list-contact-service";

describe("Price List Contact assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.database.masterModuleValue.findFirst.mockResolvedValue({ id: "channel-1", label: "RETAIL" });
    mocks.database.priceListContactAssignment.findMany.mockResolvedValue([{
      id: "assignment-1",
      created_at: new Date("2026-10-29T00:00:00.000Z"),
      contact: {
        id: "contact-1",
        code: "CT1",
        legal_name: "CONTACT LEGAL NAME",
        display_name: "CONTACT DISPLAY NAME",
        is_active: true,
      },
    }]);
    mocks.database.contact.findMany.mockResolvedValue([{
      id: "contact-2",
      code: "CT2",
      legal_name: "SECOND CONTACT",
      display_name: null,
    }]);
    mocks.database.contact.findFirst.mockResolvedValue({ id: "contact-1", code: "CT1" });
    mocks.database.masterModule.upsert.mockResolvedValue({ id: "price-list-module-1" });
    mocks.database.masterModuleValue.findFirst.mockResolvedValue({ id: "channel-1", label: "RETAIL" });
    mocks.database.masterModuleValue.count.mockResolvedValue(0);
    mocks.database.masterModuleValue.create.mockResolvedValue({
      id: "price-list-1",
      value_id: "price-list-value-1",
    });
    mocks.database.priceListContactAssignment.create.mockResolvedValue({ id: "assignment-2" });
    mocks.database.approvalRequest.create.mockResolvedValue({});
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("only resolves a channel within the authorized organization", async () => {
    await getPriceListRecord("organization-1", "channel-1");

    expect(mocks.database.masterModuleValue.findFirst).toHaveBeenCalledWith({
      where: {
        id: "channel-1",
        module: { organization_id: "organization-1", module_key: "price-list" },
      },
      select: { id: true, label: true, metadata: true },
    });
  });

  it("returns linked contacts in a bounded report result", async () => {
    const records = await listPriceListContactAssignments("organization-1", "channel-1", { take: 25 });

    expect(records).toEqual([{
      id: "assignment-1",
      createdAt: "2026-10-29T00:00:00.000Z",
      contactId: "contact-1",
      code: "CT1",
      name: "CONTACT DISPLAY NAME",
      isActive: true,
    }]);
    expect(mocks.database.priceListContactAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "organization-1", price_list_value_id: "channel-1" },
      skip: 0,
      take: 25,
    }));
  });

  it("searches only active unassigned contacts in the organization", async () => {
    const contacts = await listAvailablePriceListContacts("organization-1", "channel-1", "CT", { take: 10 });

    expect(contacts).toEqual([{ id: "contact-2", code: "CT2", name: "SECOND CONTACT" }]);
    expect(mocks.database.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "organization-1",
        is_active: true,
        price_list_assignments: {
          none: { organization_id: "organization-1", price_list_value_id: "channel-1" },
        },
      }),
      skip: 0,
      take: 10,
    }));
  });

  it("creates an assignment only for an active tenant contact and audits the actor", async () => {
    const result = await assignContactToPriceList("organization-1", "user-1", "channel-1", "contact-1");

    expect(result).toEqual({ id: "assignment-2", contactId: "contact-1" });
    expect(mocks.database.contact.findFirst).toHaveBeenCalledWith({
      where: { id: "contact-1", organization_id: "organization-1", is_active: true },
      select: { id: true, code: true },
    });
    expect(mocks.database.priceListContactAssignment.create).toHaveBeenCalledWith({
      data: {
        organization_id: "organization-1",
        price_list_value_id: "channel-1",
        contact_id: "contact-1",
      },
      select: { id: true },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "organization-1",
      userId: "user-1",
      entityType: "price-list-contact",
      entityId: "assignment-2",
    }), mocks.database);
  });

  it("atomically creates a typed Price List record and links the selected tenant Contact", async () => {
    mocks.database.masterModuleValue.findFirst.mockResolvedValueOnce(null);
    mocks.database.contact.findFirst.mockResolvedValue({
      id: "contact-1",
      code: "CT1",
      legal_name: "CONTACT LEGAL NAME",
      display_name: "CONTACT DISPLAY NAME",
    });

    const result = await createPriceListForContact(
      "organization-1",
      "user-1",
      "Hierarchy Based",
      "contact-1",
    );

    expect(result).toEqual({
      id: "price-list-1",
      valueId: "price-list-value-1",
      label: "CONTACT DISPLAY NAME",
      code: "CT1",
      contactId: "contact-1",
    });
    expect(mocks.database.masterModuleValue.create).toHaveBeenCalledWith({
      data: {
        module_id: "price-list-module-1",
        label: "CONTACT DISPLAY NAME",
        code: "CT1",
        metadata: { Channel_Type: "Hierarchy Based" },
        is_active: true,
        sort_order: 0,
      },
      select: { id: true, value_id: true },
    });
    expect(mocks.database.priceListContactAssignment.create).toHaveBeenCalledWith({
      data: {
        organization_id: "organization-1",
        price_list_value_id: "price-list-1",
        contact_id: "contact-1",
      },
      select: { id: true },
    });
    expect(mocks.database.approvalRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "organization-1",
        module_key: "price-list",
        entity_ref_id: "price-list-value-1",
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("rejects unavailable contacts and duplicate channel names", async () => {
    mocks.database.contact.findFirst.mockResolvedValueOnce(null);
    await expect(createPriceListForContact(
      "organization-1",
      "user-1",
      "Hierarchy Based",
      "foreign-contact",
    )).rejects.toThrow("Select an active Contact from this organization.");
    expect(mocks.database.masterModuleValue.create).not.toHaveBeenCalled();

    mocks.database.contact.findFirst.mockResolvedValueOnce({
      id: "contact-1",
      code: "CT1",
      legal_name: "CONTACT LEGAL NAME",
      display_name: "CONTACT DISPLAY NAME",
    });
    mocks.database.masterModuleValue.findFirst.mockResolvedValueOnce({ id: "duplicate" });
    await expect(createPriceListForContact(
      "organization-1",
      "user-1",
      "Hierarchy Based",
      "contact-1",
    )).rejects.toThrow("A Price List record with this Contact name already exists.");
    expect(mocks.database.masterModuleValue.create).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination and cross-organization channel IDs", async () => {
    await expect(listAvailablePriceListContacts("organization-1", "channel-1", "", { take: 201 }))
      .rejects.toThrow("Contact report pagination is invalid.");

    mocks.database.masterModuleValue.findFirst.mockResolvedValueOnce(null);
    await expect(listPriceListContactAssignments("organization-1", "foreign-channel"))
      .rejects.toThrow("Price List record was not found.");
  });
});
