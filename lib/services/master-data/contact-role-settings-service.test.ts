import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn(), contactRoleSetting: { findMany: vi.fn() } },
  transaction: {
    contactRoleAssignment: { findFirst: vi.fn() },
    contactDistributorDealerAssignment: { findFirst: vi.fn() },
    contactRoleMapping: { findFirst: vi.fn() },
    contactRoleSetting: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  },
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  ContactRoleSettingsUnavailableError,
  getContactCommonRoleModes,
  saveContactRoleSettings,
} from "./contact-role-settings-service";

describe("contact role settings persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) => callback(mocks.transaction),
    );
    mocks.transaction.contactRoleAssignment.findFirst.mockResolvedValue({ contact_id: "contact-1" });
    mocks.transaction.contactRoleSetting.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "setting-1",
        enabled: true,
        notifications: true,
        block_billing: false,
        always_bill_to_distributor: false,
        allow_orders: true,
        note: "ROLE NOTE",
        commission_type: "PERCENTAGE",
        use_common_settings: false,
      });
    mocks.transaction.contactRoleSetting.create.mockResolvedValue({});
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("rejects non-boolean settings before opening a database transaction", async () => {
    await expect(saveContactRoleSettings("org-1", "user-1", "contact-1", "CUSTOMER", {
      scope: "common",
      settings: {
        enabled: "true",
        notifications: true,
        blockBilling: false,
        alwaysBillToDistributor: false,
        allowOrders: true,
        note: "",
        commissionType: "PERCENTAGE",
      },
    })).rejects.toMatchObject({ status: 400 });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("saves normalized settings under the authorized organization and audits the change", async () => {
    const result = await saveContactRoleSettings("org-1", "user-1", "contact-1", "CUSTOMER", {
      scope: "common",
      settings: {
        enabled: true,
        notifications: true,
        blockBilling: false,
        alwaysBillToDistributor: false,
        allowOrders: true,
        note: "role note",
        commissionType: "PERCENTAGE",
      },
    });

    expect(mocks.transaction.contactRoleAssignment.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-1", contact_id: "contact-1", role_code: "CUSTOMER", is_active: true },
      select: { contact_id: true },
    });
    expect(mocks.transaction.contactRoleSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-1",
        contact_id: "contact-1",
        role_code: "CUSTOMER",
        mapped_contact_id: null,
        note: "ROLE NOTE",
      }),
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      userId: "user-1",
      entityId: "setting-1",
    }), mocks.transaction);
    expect(result).toMatchObject({ note: "ROLE NOTE", useCommonSettings: false });
  });

  it("reports a pending role-settings migration without returning default settings", async () => {
    mocks.prisma.contactRoleSetting.findMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Table does not exist", {
        code: "P2021",
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    await expect(getContactCommonRoleModes("org-1", "contact-1", ["CUSTOMER"]))
      .rejects.toBeInstanceOf(ContactRoleSettingsUnavailableError);
  });

  it("reports a stale Prisma client explicitly instead of dereferencing a missing delegate", async () => {
    const roleSettingsDelegate = mocks.prisma.contactRoleSetting;
    Object.defineProperty(mocks.prisma, "contactRoleSetting", { configurable: true, value: undefined });

    try {
      await expect(getContactCommonRoleModes("org-1", "contact-1", ["CUSTOMER"]))
        .rejects.toThrow("Regenerate the Prisma client and restart the application.");
    } finally {
      Object.defineProperty(mocks.prisma, "contactRoleSetting", {
        configurable: true,
        value: roleSettingsDelegate,
      });
    }
  });
});
